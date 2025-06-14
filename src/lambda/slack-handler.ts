import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { App, AwsLambdaReceiver } from '@slack/bolt';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({ region: 'ap-northeast-1' });
const s3Client = new S3Client({ region: 'ap-northeast-1' });

// Cache for SSM parameters to avoid repeated API calls
let slackConfig: {
  botToken: string;
  signingSecret: string;
  s3Bucket: string;
} | null = null;

async function getSlackConfig() {
  if (slackConfig) {
    return slackConfig;
  }

  try {
    const [botToken, signingSecret, s3Bucket] = await Promise.all([
      ssmClient.send(new GetParameterCommand({
        Name: '/slack-ai-agent-demo/production/bot-token',
        WithDecryption: true,
      })),
      ssmClient.send(new GetParameterCommand({
        Name: '/slack-ai-agent-demo/production/signing-secret',
        WithDecryption: true,
      })),
      ssmClient.send(new GetParameterCommand({
        Name: '/slack-ai-agent-demo/production/s3-bucket',
      })),
    ]);

    slackConfig = {
      botToken: botToken.Parameter?.Value || '',
      signingSecret: signingSecret.Parameter?.Value || '',
      s3Bucket: s3Bucket.Parameter?.Value || '',
    };

    return slackConfig;
  } catch (error) {
    console.error('Failed to get SSM parameters:', error);
    throw new Error('Configuration error');
  }
}

let app: App | null = null;
let awsLambdaReceiver: AwsLambdaReceiver | null = null;

async function getApp() {
  if (app && awsLambdaReceiver) {
    return { app, awsLambdaReceiver };
  }

  const config = await getSlackConfig();
  
  awsLambdaReceiver = new AwsLambdaReceiver({
    signingSecret: config.signingSecret,
  });

  app = new App({
    token: config.botToken,
    receiver: awsLambdaReceiver,
    processBeforeResponse: true,
  });

  // Register message handlers
  app.message('hello', async ({ message, say }) => {
    await say('Hello, World!');
  });

  // S3 list objects command
  app.message('list-s3', async ({ message, say }) => {
    try {
      const config = await getSlackConfig();
      const command = new ListObjectsV2Command({
        Bucket: config.s3Bucket,
        MaxKeys: 20,
      });
      
      const response = await s3Client.send(command);
      
      if (!response.Contents || response.Contents.length === 0) {
        await say('S3バケットにオブジェクトが見つかりませんでした。');
        return;
      }
      
      const objectList = response.Contents.map(obj => {
        const size = obj.Size ? `${(obj.Size / 1024).toFixed(1)}KB` : '不明';
        const lastModified = obj.LastModified ? obj.LastModified.toISOString().slice(0, 19).replace('T', ' ') : '不明';
        return `• ${obj.Key} (${size}, ${lastModified})`;
      }).join('\n');
      
      await say(`📦 S3バケットのオブジェクト一覧:\n\n${objectList}\n\n💡 ダウンロードURLを取得するには \`s3-url <ファイル名>\` を使用してください。`);
    } catch (error) {
      console.error('S3 list error:', error);
      await say('❌ S3オブジェクトの一覧取得中にエラーが発生しました。');
    }
  });

  // S3 presigned URL command
  app.message(/^s3-url\s+(.+)/, async ({ message, say, context }) => {
    try {
      const config = await getSlackConfig();
      const objectKey = context.matches[1].trim();
      
      const command = new GetObjectCommand({
        Bucket: config.s3Bucket,
        Key: objectKey,
      });
      
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes
      
      await say(`🔗 ダウンロードURL（15分間有効）:\n\n\`${objectKey}\`\n${signedUrl}\n\n⚠️ このURLは15分後に無効になります。`);
    } catch (error) {
      console.error('S3 presigned URL error:', error);
      await say(`❌ ファイル \`${context.matches[1].trim()}\` のダウンロードURL生成中にエラーが発生しました。ファイル名を確認してください。`);
    }
  });

  return { app, awsLambdaReceiver };
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