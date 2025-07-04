import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { Fn } from 'aws-cdk-lib';
import * as path from 'path';

export class SlackAiAgentDemoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Import existing components from infrastructure stacks
    const vpcId = Fn.importValue('slack-ai-agent-demo-base-VpcId');
    const privateSubnetIds = Fn.split(',', Fn.importValue('slack-ai-agent-demo-base-PrivateSubnets'));
    const lambdaSecurityGroupId = Fn.importValue('slack-ai-agent-demo-base-LambdaSecurityGroup');
    const lambdaRoleArn = Fn.importValue('slack-ai-agent-demo-application-LambdaRole');

    // VPC reference using fromVpcAttributes without subnet validation
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ExistingVpc', {
      vpcId: vpcId,
      availabilityZones: ['ap-northeast-1a', 'ap-northeast-1c'],
    });

    // Manual subnet import
    const privateSubnet1 = ec2.Subnet.fromSubnetId(this, 'PrivateSubnet1', 
      Fn.select(0, privateSubnetIds)
    );
    const privateSubnet2 = ec2.Subnet.fromSubnetId(this, 'PrivateSubnet2', 
      Fn.select(1, privateSubnetIds)
    );

    // Existing security group reference
    const lambdaSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this, 'ExistingLambdaSecurityGroup', lambdaSecurityGroupId
    );

    // Existing IAM role reference
    const lambdaRole = iam.Role.fromRoleArn(
      this, 'ExistingLambdaRole', lambdaRoleArn
    );

    // Note: S3, SSM, and Bedrock permissions are already included in the existing role from infrastructure stack

    // DynamoDB table for event deduplication
    const deduplicationTable = new dynamodb.Table(this, 'EventDeduplicationTable', {
      tableName: 'slack-ai-agent-event-deduplication',
      partitionKey: { name: 'eventKey', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Grant DynamoDB permissions to Lambda role
    deduplicationTable.grantReadWriteData(lambdaRole);

    // Lambda function with VPC placement
    const lambdaFunction = new nodejs.NodejsFunction(this, 'SlackHandlerFunction', {
      entry: path.join(__dirname, '../src/lambda/slack-handler.ts'),
      functionName: 'slack-ai-agent-demo-handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      bundling: {
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
      environment: {
        NODE_ENV: 'production',
      },
      role: lambdaRole,
      // VPC configuration removed for faster cold start (Slack 3-second timeout requirement)
      // vpc: vpc,
      // vpcSubnets: {
      //   subnets: [privateSubnet1, privateSubnet2],
      // },
      // securityGroups: [lambdaSecurityGroup],
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