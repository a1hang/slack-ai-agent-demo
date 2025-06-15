import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { App, AwsLambdaReceiver } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { 
  BedrockAgentRuntimeClient, 
  RetrieveAndGenerateCommand 
} from '@aws-sdk/client-bedrock-agent-runtime';
import { DynamoDBClient, PutItemCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';

const ssmClient = new SSMClient({ region: 'ap-northeast-1' });
const s3Client = new S3Client({ region: 'ap-northeast-1' });
const bedrockClient = new BedrockAgentRuntimeClient({ region: 'ap-northeast-1' });
const dynamodbClient = new DynamoDBClient({ region: 'ap-northeast-1' });

// Cache for SSM parameters to avoid repeated API calls
let slackConfig: {
  botToken: string;
  signingSecret: string;
  s3Bucket: string;
  knowledgeBaseId: string;
} | null = null;

async function getSlackConfig() {
  if (slackConfig) {
    return slackConfig;
  }

  try {
    const [botToken, signingSecret, s3Bucket, knowledgeBaseId] = await Promise.all([
      ssmClient.send(new GetParameterCommand({
        Name: '/slack-ai-agent/bot-token',
        WithDecryption: true,
      })),
      ssmClient.send(new GetParameterCommand({
        Name: '/slack-ai-agent/signing-secret',
        WithDecryption: true,
      })),
      ssmClient.send(new GetParameterCommand({
        Name: '/slack-ai-agent/s3-bucket',
      })),
      ssmClient.send(new GetParameterCommand({
        Name: '/slack-ai-agent/knowledge-base-id',
      })),
    ]);

    slackConfig = {
      botToken: botToken.Parameter?.Value || '',
      signingSecret: signingSecret.Parameter?.Value || '',
      s3Bucket: s3Bucket.Parameter?.Value || '',
      knowledgeBaseId: knowledgeBaseId.Parameter?.Value || '',
    };

    return slackConfig;
  } catch (error) {
    console.error('Failed to get SSM parameters:', error);
    throw new Error('Configuration error');
  }
}

async function checkDuplicateEvent(eventKey: string): Promise<boolean> {
  const ttl = Math.floor(Date.now() / 1000) + 300; // 5分後にTTL
  
  try {
    await dynamodbClient.send(new PutItemCommand({
      TableName: 'slack-ai-agent-event-deduplication',
      Item: {
        eventKey: { S: eventKey },
        ttl: { N: ttl.toString() },
        timestamp: { S: new Date().toISOString() }
      },
      ConditionExpression: 'attribute_not_exists(eventKey)'
    }));
    return false; // 新しいイベント
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) {
      return true; // 重複イベント
    }
    throw error;
  }
}

let app: App | null = null;
let awsLambdaReceiver: AwsLambdaReceiver | null = null;
let webClient: WebClient | null = null;

async function getApp() {
  if (app && awsLambdaReceiver && webClient) {
    return { app, awsLambdaReceiver, webClient };
  }

  const config = await getSlackConfig();
  
  awsLambdaReceiver = new AwsLambdaReceiver({
    signingSecret: config.signingSecret,
  });

  webClient = new WebClient(config.botToken);

  app = new App({
    token: config.botToken,
    receiver: awsLambdaReceiver,
    processBeforeResponse: true,
  });

  // Register app_mention event handler (replaces message handlers)
  app.event('app_mention', async ({ event, say, client }) => {
    const eventKey = `${event.channel}-${event.ts}-${event.user}`;
    
    // 重複チェック
    if (await checkDuplicateEvent(eventKey)) {
      console.log(`Duplicate event detected, skipping: ${eventKey}`);
      return;
    }
    
    const text = event.text.toLowerCase();
    const threadTs = event.thread_ts || event.ts;

    if (text.includes('hello')) {
      await say({
        text: 'Hello, World!',
        thread_ts: threadTs,
      });
    } else if (text.includes('list-s3')) {
      await handleListS3(event, say, client, threadTs);
    } else if (text.match(/s3-url\s+(.+)/)) {
      const match = text.match(/s3-url\s+(.+)/);
      if (match) {
        const objectKey = match[1].trim();
        await handleS3Url(event, say, client, threadTs, objectKey);
      }
    } else if (text.includes('ask ')) {
      const query = event.text.match(/ask (.+)/i)?.[1];
      if (!query) {
        await say({
          text: "質問を入力してください。例: @Slack AI Agent ask プロジェクト管理のベストプラクティスは？",
          thread_ts: threadTs,
        });
        return;
      }
      await handleAskCommand(event, say, client, threadTs, query);
    } else {
      await say({
        text: '👋 こんにちは！利用可能なコマンド:\n• `@Slack AI Agent hello` - 挨拶\n• `@Slack AI Agent list-s3` - S3ファイル一覧\n• `@Slack AI Agent s3-url <ファイル名>` - ダウンロードURL生成\n• `@Slack AI Agent ask <質問>` - AI問答',
        thread_ts: threadTs,
      });
    }
  });

  return { app, awsLambdaReceiver, webClient };
}

// Bedrock Knowledge Base search function
async function searchWithBedrockKB(
  query: string, 
  knowledgeBaseId: string
): Promise<any> {
  try {
    const command = new RetrieveAndGenerateCommand({
      input: {
        text: query
      },
      retrieveAndGenerateConfiguration: {
        type: "KNOWLEDGE_BASE",
        knowledgeBaseConfiguration: {
          knowledgeBaseId: knowledgeBaseId,
          modelArn: "arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
        }
      }
    });
    
    const response = await bedrockClient.send(command);
    return response;
  } catch (error) {
    console.error('Bedrock Knowledge Base Error:', error);
    throw new Error('文書検索中にエラーが発生しました');
  }
}

// S3 list objects with progress display  
async function handleListS3(event: any, say: any, client: any, threadTs: string) {
  // Step 1: Show progress message immediately
  const progressMsg = await say({
    text: "📡 S3情報を取得中...",
    thread_ts: threadTs,
    blocks: [{
      type: "section",
      text: { 
        type: "mrkdwn", 
        text: "📡 S3情報を取得中..." 
      }
    }]
  });

  try {
    const config = await getSlackConfig();
    const command = new ListObjectsV2Command({
      Bucket: config.s3Bucket,
      MaxKeys: 20,
    });
    
    const response = await s3Client.send(command);
    
    if (!response.Contents || response.Contents.length === 0) {
      // Step 3: Update progress message with result
      await client.chat.update({
        channel: event.channel,
        ts: progressMsg.ts,
        text: "S3バケットにオブジェクトが見つかりませんでした。",
        blocks: [{
          type: "section",
          text: { 
            type: "mrkdwn", 
            text: "📁 S3バケットにオブジェクトが見つかりませんでした。" 
          }
        }]
      });
      return;
    }
    
    // Build file list blocks
    const objectBlocks = response.Contents.map(obj => {
      const size = obj.Size ? `${(obj.Size / 1024).toFixed(1)}KB` : '不明';
      const lastModified = obj.LastModified ? obj.LastModified.toISOString().slice(0, 19).replace('T', ' ') : '不明';
      return {
        type: "section",
        text: { 
          type: "mrkdwn", 
          text: `\`${obj.Key}\` (${size}) - ${lastModified}` 
        }
      };
    });
    
    // Step 3: Update progress message with complete results
    await client.chat.update({
      channel: event.channel,
      ts: progressMsg.ts,
      text: `✅ S3に${response.Contents.length}件のファイルがあります`,
      blocks: [
        {
          type: "section",
          text: { 
            type: "mrkdwn", 
            text: `✅ S3に*${response.Contents.length}件*のファイルがあります` 
          }
        },
        {
          type: "section",
          text: { 
            type: "mrkdwn", 
            text: "*📂 ファイル一覧*" 
          }
        },
        ...objectBlocks,
        {
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: "💡 ダウンロードURLを取得するには `@Slack AI Agent s3-url <ファイル名>` を使用してください。"
          }]
        }
      ]
    });
  } catch (error) {
    console.error('S3 list error:', error);
    // Step 3: Update progress message with error
    await client.chat.update({
      channel: event.channel,
      ts: progressMsg.ts,
      text: "S3オブジェクトの一覧取得中にエラーが発生しました。",
      blocks: [{
        type: "section",
        text: { 
          type: "mrkdwn", 
          text: "❌ S3オブジェクトの一覧取得中にエラーが発生しました。" 
        }
      }]
    });
  }
}

// S3 presigned URL generation with progress display
async function handleS3Url(event: any, say: any, client: any, threadTs: string, objectKey: string) {
  // Step 1: Show progress message immediately
  const progressMsg = await say({
    text: "📡 ダウンロードURL生成中...",
    thread_ts: threadTs,
    blocks: [{
      type: "section",
      text: { 
        type: "mrkdwn", 
        text: `📡 \`${objectKey}\` のダウンロードURL生成中...` 
      }
    }]
  });

  try {
    const config = await getSlackConfig();
    const command = new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: objectKey,
      ResponseContentType: 'text/plain; charset=utf-8',
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(objectKey)}`
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes
    
    // Step 3: Update progress message with result
    await client.chat.update({
      channel: event.channel,
      ts: progressMsg.ts,
      text: `${objectKey} のダウンロードリンクを生成しました`,
      blocks: [
        {
          type: "section",
          text: { 
            type: "mrkdwn", 
            text: `✅ *${objectKey}* のダウンロードリンクを生成しました（15分間有効）` 
          }
        },
        {
          type: "section",
          text: { 
            type: "mrkdwn", 
            text: `<${signedUrl}|📁 ダウンロード>` 
          }
        },
        {
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: "⚠️ このURLは15分後に無効になります。"
          }]
        }
      ]
    });
  } catch (error) {
    console.error('S3 presigned URL error:', error);
    // Step 3: Update progress message with error
    await client.chat.update({
      channel: event.channel,
      ts: progressMsg.ts,
      text: `ファイル ${objectKey} のダウンロードURL生成中にエラーが発生しました`,
      blocks: [{
        type: "section",
        text: { 
          type: "mrkdwn", 
          text: `❌ ファイル \`${objectKey}\` のダウンロードURL生成中にエラーが発生しました。ファイル名を確認してください。` 
        }
      }]
    });
  }
}

// Ask command handler with Bedrock Knowledge Base
async function handleAskCommand(event: any, say: any, client: any, threadTs: string, query: string) {
  // Step 1: Show search progress
  const progressMsg = await say({
    text: "🔍 Bedrock Knowledge Baseで検索中...",
    thread_ts: threadTs,
  });

  try {
    const config = await getSlackConfig();
    
    // Step 2: Bedrock Knowledge Base search and generation
    const response = await searchWithBedrockKB(query, config.knowledgeBaseId);
    
    // Step 3: Update with final answer
    await client.chat.update({
      channel: event.channel,
      ts: progressMsg.ts,
      text: "✅ 回答完了",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*質問*: ${query}\n\n*回答*:\n${response.output?.text || '回答を生成できませんでした。'}`
          }
        },
        {
          type: "context",
          elements: [{
            type: "mrkdwn",
            text: `📚 AWS Bedrock Knowledge Base (Aurora Serverless v2)`
          }]
        }
      ]
    });
    
  } catch (error) {
    console.error('Ask command error:', error);
    await client.chat.update({
      channel: event.channel,
      ts: progressMsg.ts,
      text: "❌ 回答生成中にエラーが発生しました",
      blocks: [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `エラー: ${(error as Error).message}`
        }
      }]
    });
  }
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    const { awsLambdaReceiver } = await getApp();
    const awsHandler = awsLambdaReceiver.toHandler();
    return await awsHandler(event, context, () => {});
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};