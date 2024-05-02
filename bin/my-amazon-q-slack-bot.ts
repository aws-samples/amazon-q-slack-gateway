#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MyAmazonQSlackBotStack } from '../lib/my-amazon-q-slack-bot-stack';
import { readFileSync } from 'fs';

export interface StackEnvironment {
  StackName: string;
  AmazonQAppId: string;
  AmazonQRegion: string;
  ContextDaysToLive: string;
  OIDCIdPName: string;
  OIDCClientId: string;
  OIDCIssuerURL: string;
  GatewayIdCAppARN: string;
}

const app = new cdk.App();
const inputEnvFile = app.node.tryGetContext('environment');
if (inputEnvFile === undefined) {
  throw new Error('An input environment file is required');
}

const environment = JSON.parse(readFileSync(inputEnvFile).toString()) as StackEnvironment;
if (environment.StackName === undefined) {
  throw new Error('StackName is required');
}
if (environment.AmazonQAppId === undefined) {
  throw new Error('AmazonQAppId is required');
}
if (environment.AmazonQRegion === undefined) {
  throw new Error('AmazonQRegion is required');
}
if (environment.ContextDaysToLive === undefined) {
  throw new Error('ContextDaysToLive is required');
}
if (environment.OIDCIdPName === undefined) {
  throw new Error('OIDCIdPName is required');
}
if (environment.OIDCClientId === undefined) {
  throw new Error('OIDCClientId is required');
}
if (environment.OIDCIssuerURL === undefined) {
  throw new Error('OIDCIssuerURL is required');
}
if (environment.GatewayIdCAppARN === undefined) {
  throw new Error('GatewayIdCAppARN is required');
}

new MyAmazonQSlackBotStack(
  app,
  'AmazonQSlackGatewayStack',
  {
    stackName: environment.StackName
  },
  environment
);
