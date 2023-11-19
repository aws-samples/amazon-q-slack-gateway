#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MyEnterpriseQSlackBotStack } from '../lib/my-enterprise-q-slack-bot-stack';
import { readFileSync } from 'fs';

export interface StackEnvironment {
  StackName: string
  EnterpriseQAppId: string
  EnterpriseQUserId: string
  EnterpriseQRegion: string;
  EnterpriseQEndpoint?: string;
}

const app = new cdk.App();
const inputEnvFile = app.node.tryGetContext('environment');
if (inputEnvFile === undefined) { throw new Error("An input environment file is required"); }

const environment = JSON.parse(readFileSync(inputEnvFile).toString()) as StackEnvironment;
if (environment.StackName === undefined) { throw new Error("StackName is required"); }
if (environment.EnterpriseQAppId === undefined) { throw new Error("EnterpriseQAppId is required"); }
if (environment.EnterpriseQRegion === undefined) { throw new Error("EnterpriseQRegion is required"); }
if (environment.EnterpriseQUserId === undefined) { throw new Error("EnterpriseQUserId is required"); }

new MyEnterpriseQSlackBotStack(app, 'AmazonQSlackGatewayStack', {
  stackName: environment.StackName,
}, environment);