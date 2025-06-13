import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SlackAiAgentDemoStack } from '../slack-ai-agent-stack';

describe('SlackAiAgentDemoStack', () => {
  let app: cdk.App;
  let stack: SlackAiAgentDemoStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new SlackAiAgentDemoStack(app, 'TestSlackAiAgentDemoStack', {
      env: {
        account: '123456789012',
        region: 'ap-northeast-1',
      },
    });
    template = Template.fromStack(stack);
  });

  it('should create a Lambda function', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Handler: 'slack-handler.handler',
      Timeout: 30,
    });
  });

  it('should create an API Gateway', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'SlackAiAgentDemoApi',
    });
  });

  it('should create API Gateway method for POST /slack/events', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'NONE',
    });
  });

  it('should create Lambda permission for API Gateway', () => {
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
    });
  });

  it('should have environment variables for Lambda', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          SLACK_BOT_TOKEN: Match.anyValue(),
          SLACK_SIGNING_SECRET: Match.anyValue(),
        },
      },
    });
  });

  it('should create IAM role with necessary permissions', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
    });
  });

  it('should attach basic Lambda execution policy', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      ManagedPolicyArns: [
        {
          'Fn::Join': [
            '',
            [
              'arn:',
              { Ref: 'AWS::Partition' },
              ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
            ],
          ],
        },
      ],
    });
  });
});