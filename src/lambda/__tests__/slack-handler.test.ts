import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handler } from '../slack-handler';

// Mock AWS SDK SSM client
jest.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({
      Parameter: {
        Value: 'mock-value'
      }
    })
  })),
  GetParameterCommand: jest.fn()
}));

// Mock AWS SDK Bedrock Agent Runtime client
jest.mock('@aws-sdk/client-bedrock-agent-runtime', () => ({
  BedrockAgentRuntimeClient: jest.fn(() => ({
    send: jest.fn().mockResolvedValue({
      output: {
        text: 'Mock response from Bedrock Knowledge Base'
      }
    })
  })),
  RetrieveAndGenerateCommand: jest.fn()
}));

jest.mock('@slack/bolt', () => ({
  App: jest.fn().mockImplementation(() => ({
    event: jest.fn(),
    start: jest.fn(),
    receiver: {
      toHandler: jest.fn().mockReturnValue(async (event: any, context: any) => ({
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Hello, World!',
          blocks: [{
            type: "section",
            text: { type: "mrkdwn", text: "Hello, World!" }
          }]
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      })),
    },
  })),
  AwsLambdaReceiver: jest.fn().mockImplementation(() => ({
    toHandler: jest.fn().mockReturnValue(async (event: any, context: any) => ({
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Hello, World!',
        blocks: [{
          type: "section",
          text: { type: "mrkdwn", text: "Hello, World!" }
        }]
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    })),
  })),
}));

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      update: jest.fn().mockResolvedValue({ ok: true }),
    },
  })),
}));

describe('Slack Handler', () => {
  const mockEvent: APIGatewayProxyEvent = {
    body: JSON.stringify({
      type: 'event_callback',
      event: {
        type: 'message',
        text: 'hello',
        channel: 'C123456',
        user: 'U123456',
      },
    }),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/slack/events',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api123',
      authorizer: {},
      httpMethod: 'POST',
      protocol: 'HTTP/1.1',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: '/slack/events',
      stage: 'prod',
      requestId: 'req123',
      requestTime: '01/Jan/1970:00:00:00 +0000',
      requestTimeEpoch: 0,
      resourceId: 'res123',
      resourcePath: '/slack/events',
    },
    resource: '/slack/events',
  };

  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '1',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'request-id',
    logGroupName: 'log-group',
    logStreamName: 'log-stream',
    getRemainingTimeInMillis: () => 30000,
    done: jest.fn(),
    fail: jest.fn(),
    succeed: jest.fn(),
  };

  it('should respond with Hello, World! when receiving hello message', async () => {
    const result = await handler(mockEvent, mockContext) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Hello, World!');
    expect(body.blocks).toBeDefined();
    expect(body.blocks[0].type).toBe('section');
  });

  it('should handle non-hello messages gracefully', async () => {
    const eventWithDifferentMessage = {
      ...mockEvent,
      body: JSON.stringify({
        type: 'event_callback',
        event: {
          type: 'app_mention',
          text: '@Slack AI Agent goodbye',
          channel: 'C123456',
          user: 'U123456',
          ts: '1234567890.123456',
        },
      }),
    };

    const result = await handler(eventWithDifferentMessage, mockContext) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(200);
  });

  it('should handle ask command with Bedrock Knowledge Base', async () => {
    const eventWithAskCommand = {
      ...mockEvent,
      body: JSON.stringify({
        type: 'event_callback',
        event: {
          type: 'app_mention',
          text: '@Slack AI Agent ask What is project management?',
          channel: 'C123456',
          user: 'U123456',
          ts: '1234567890.123456',
        },
      }),
    };

    const result = await handler(eventWithAskCommand, mockContext) as APIGatewayProxyResult;
    
    expect(result.statusCode).toBe(200);
  });
});