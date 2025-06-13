import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export class SlackAiAgentDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create IAM role with S3 permissions
    const lambdaRole = new iam.Role(this, 'SlackHandlerRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add S3 permissions for demo bucket operations
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:ListBucket',
        's3:GetObjectAttributes',
      ],
      resources: [
        'arn:aws:s3:::*', // Dynamic bucket name from SSM
        'arn:aws:s3:::*/*',
      ],
    }));

    // Add SSM Parameter Store read permissions
    lambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:ap-northeast-1:794587662786:parameter/slack-ai-agent/*`,
      ],
    }));

    const lambdaFunction = new nodejs.NodejsFunction(this, 'SlackHandlerFunction', {
      entry: path.join(__dirname, '../src/lambda/slack-handler.ts'),
      functionName: 'slack-ai-agent-demo-handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        externalModules: ['aws-sdk'],
        forceDockerBundling: false,
      },
      environment: {
        NODE_ENV: 'production',
      },
      role: lambdaRole,
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