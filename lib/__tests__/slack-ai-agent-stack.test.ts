import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { SlackAiAgentDemoStack } from '../slack-ai-agent-stack';

describe('SlackAiAgentDemoStack', () => {
  let app: cdk.App;
  let stack: SlackAiAgentDemoStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    
    // Mock the ImportValue and split functions for testing
    const originalImportValue = cdk.Fn.importValue;
    const originalSplit = cdk.Fn.split;
    
    cdk.Fn.importValue = jest.fn().mockImplementation((name: string) => {
      switch (name) {
        case 'slack-ai-agent-demo-base-VpcId':
          return 'vpc-12345678';
        case 'slack-ai-agent-demo-base-PrivateSubnets':
          return 'subnet-1234,subnet-5678';
        case 'slack-ai-agent-demo-base-LambdaSecurityGroup':
          return 'sg-12345678';
        case 'slack-ai-agent-demo-application-LambdaRole':
          return 'arn:aws:iam::123456789012:role/BedrockLambdaRole';
        default:
          return originalImportValue(name);
      }
    });
    
    cdk.Fn.split = jest.fn().mockImplementation((delimiter: string, value: string) => {
      if (delimiter === ',' && value === 'subnet-1234,subnet-5678') {
        return ['subnet-1234', 'subnet-5678'];
      }
      return originalSplit(delimiter, value);
    });
    
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
      Handler: 'index.handler', // NodejsFunction automatically sets this
      Timeout: 60,
      MemorySize: 512,
      FunctionName: 'slack-ai-agent-demo-handler',
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
          NODE_ENV: 'production',
        },
      },
    });
  });

  it('should only create CloudWatch role for API Gateway', () => {
    // Should have one IAM Role for API Gateway CloudWatch logs
    const roles = template.findResources('AWS::IAM::Role');
    expect(Object.keys(roles)).toHaveLength(1);
    expect(Object.keys(roles)[0]).toContain('CloudWatchRole');
    
    // Should not have IAM Policy creation since permissions are in existing role
    const policies = template.findResources('AWS::IAM::Policy');
    expect(Object.keys(policies)).toHaveLength(0);
  });

  it('should reference existing VPC configuration', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      VpcConfig: {
        SecurityGroupIds: ['sg-12345678'],
        SubnetIds: ['subnet-1234', 'subnet-5678'],
      },
    });
  });

  it('should use existing IAM role from infrastructure stack', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Role: 'arn:aws:iam::123456789012:role/BedrockLambdaRole',
    });
  });
});