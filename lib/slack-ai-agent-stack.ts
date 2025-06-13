import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class SlackAiAgentDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const lambdaFunction = new lambda.Function(this, 'SlackHandlerFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'slack-handler.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lib')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
        SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',
        NODE_ENV: 'production',
      },
      role: new iam.Role(this, 'SlackHandlerRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      }),
    });

    const api = new apigateway.RestApi(this, 'SlackAiAgentApi', {
      restApiName: 'SlackAiAgentDemoApi',
      description: 'API Gateway for Slack AI Agent Demo',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    const slackResource = api.root.addResource('slack');
    const eventsResource = slackResource.addResource('events');

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction, {
      requestTemplates: { 'application/json': '{ "statusCode": "200" }' },
    });

    eventsResource.addMethod('POST', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'SlackEventsUrl', {
      value: `${api.url}slack/events`,
      description: 'Slack Events API endpoint URL',
    });
  }
}