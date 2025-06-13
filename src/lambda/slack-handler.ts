import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { App, AwsLambdaReceiver } from '@slack/bolt';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const s3Client = new S3Client({ region: 'ap-northeast-1' });
const S3_DEMO_BUCKET = process.env.S3_DEMO_BUCKET || 'slack-ai-agent-demo-bucket';

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  processBeforeResponse: true,
});

app.message('hello', async ({ message, say }) => {
  await say('Hello, World!');
});

// S3 list objects command
app.message('list-s3', async ({ message, say }) => {
  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_DEMO_BUCKET,
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
    
    await say(`📦 S3バケット \`${S3_DEMO_BUCKET}\` のオブジェクト一覧:\n\n${objectList}\n\n💡 ダウンロードURLを取得するには \`s3-url <ファイル名>\` を使用してください。`);
  } catch (error) {
    console.error('S3 list error:', error);
    await say('❌ S3オブジェクトの一覧取得中にエラーが発生しました。');
  }
});

// S3 presigned URL command
app.message(/^s3-url\s+(.+)/, async ({ message, say, context }) => {
  try {
    const objectKey = context.matches[1].trim();
    
    const command = new GetObjectCommand({
      Bucket: S3_DEMO_BUCKET,
      Key: objectKey,
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes
    
    await say(`🔗 ダウンロードURL（15分間有効）:\n\n\`${objectKey}\`\n${signedUrl}\n\n⚠️ このURLは15分後に無効になります。`);
  } catch (error) {
    console.error('S3 presigned URL error:', error);
    await say(`❌ ファイル \`${context.matches[1].trim()}\` のダウンロードURL生成中にエラーが発生しました。ファイル名を確認してください。`);
  }
});

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const awsHandler = awsLambdaReceiver.toHandler();
  return await awsHandler(event, context, () => {});
};