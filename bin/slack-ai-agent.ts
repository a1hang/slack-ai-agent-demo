#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SlackAiAgentDemoStack } from '../lib/slack-ai-agent-stack';
import * as dotenv from 'dotenv';

dotenv.config();

const app = new cdk.App();

new SlackAiAgentDemoStack(app, 'SlackAiAgentDemoStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID,
    region: process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'ap-northeast-1',
  },
  description: 'Slack AI Agent Demo with AWS Lambda and API Gateway',
  tags: {
    Project: 'SlackAiAgentDemo',
    Environment: process.env.NODE_ENV || 'development',
  },
});