import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { App, AwsLambdaReceiver } from '@slack/bolt';

const awsLambdaReceiver = new AwsLambdaReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET!,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: awsLambdaReceiver,
  processBeforeResponse: true,
});

app.message('hello', async ({ message, say }) => {
  await say('Hello, World!');
});

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  const awsHandler = awsLambdaReceiver.toHandler();
  return await awsHandler(event, context, () => {});
};