import * as cdk from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';

import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

import {
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal
} from 'aws-cdk-lib/aws-iam';
import { StackEnvironment } from '../bin/my-amazon-q-slack-bot';

import * as fs from 'fs';
const packageJson = fs.readFileSync('package.json', 'utf-8');
const version = JSON.parse(packageJson).version;
const STACK_DESCRIPTION = `Amazon Q Slack Gateway - v${version}`;

export class MyAmazonQSlackBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, env: StackEnvironment) {
    super(scope, id, {
      ...props,
      description: STACK_DESCRIPTION
    });

    // Reference the AWS::StackName directly
    const refStackName = cdk.Fn.ref('AWS::StackName');

    const vpc = new Vpc(this, `${props.stackName}-VPC`);

    const initialSecretContent = JSON.stringify({
      SlackSigningSecret: '<Replace with Signing Secret>',
      SlackBotUserOAuthToken: '<Replace with Bot User OAuth Token>'
    });
    const slackSecret = new Secret(this, `${props.stackName}-Secret`, {
      secretName: `${refStackName}-Secret`,
      secretStringValue: cdk.SecretValue.unsafePlainText(initialSecretContent)
    });
    // Output URL to the secret in the AWS Management Console
    new CfnOutput(this, 'SlackSecretConsoleUrl', {
      value: `https://${this.region}.console.aws.amazon.com/secretsmanager/secret?name=${slackSecret.secretName}&region=${this.region}`,
      description: 'Click to edit the Slack secrets in the AWS Secrets Manager console'
    });

    const dynamoCache = new Table(this, `${props.stackName}-DynamoCache`, {
      tableName: `${refStackName}-channels-metadata`,
      partitionKey: {
        name: 'channel',
        type: AttributeType.STRING
      },
      timeToLiveAttribute: 'expireAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const messageMetadata = new Table(this, `${props.stackName}-MessageMetadata`, {
      tableName: `${refStackName}-responses-metadata`,
      partitionKey: {
        name: 'messageId',
        type: AttributeType.STRING
      },
      timeToLiveAttribute: 'expireAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    [
      {
        handler: 'slack-event-handler',
        id: 'SlackEventHandler',
        description: 'Lambda function handler for Slack events'
      },
      {
        handler: 'slack-interaction-handler',
        id: 'SlackInteractionHandler',
        description: 'Lambda function handler for Slack interactions'
      },
      {
        handler: 'slack-command-handler',
        id: 'SlackCommandHandler',
        description: 'Lambda function handler for Slack commands'
      }
    ].map((p) => {
      const suffix = `${props.stackName}-${p.id}`;
      new LambdaRestApi(this, `${suffix}-Api`, {
        handler: new lambda.NodejsFunction(this, `${suffix}-Fn`, {
          functionName: `${refStackName}-${p.id}`,
          entry: `src/functions/${p.handler}.ts`,
          handler: `handler`,
          description: `${p.description}, Revision: ${new Date().toISOString()})`,
          timeout: Duration.seconds(30),
          environment: {
            SLACK_SECRET_NAME: slackSecret.secretName,
            AMAZON_Q_ENDPOINT: env.AmazonQEndpoint ?? '',
            AMAZON_Q_REGION: env.AmazonQRegion,
            AMAZON_Q_APP_ID: env.AmazonQAppId,
            AMAZON_Q_USER_ID: env.AmazonQUserId ?? '',
            CONTEXT_DAYS_TO_LIVE: env.ContextDaysToLive,
            CACHE_TABLE_NAME: dynamoCache.tableName,
            MESSAGE_METADATA_TABLE_NAME: messageMetadata.tableName
          },
          role: new Role(this, `${suffix}-Role`, {
            assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
              ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
            ],
            inlinePolicies: {
              SecretManagerPolicy: new PolicyDocument({
                statements: [
                  new PolicyStatement({
                    actions: ['secretsmanager:GetSecretValue'],
                    resources: [slackSecret.secretArn]
                  })
                ]
              }),
              DynamoDBPolicy: new PolicyDocument({
                statements: [
                  new PolicyStatement({
                    actions: ['dynamodb:DeleteItem', 'dynamodb:PutItem', 'dynamodb:GetItem'],
                    resources: [dynamoCache.tableArn, messageMetadata.tableArn]
                  })
                ]
              }),
              ChatPolicy: new PolicyDocument({
                statements: [
                  new PolicyStatement({
                    actions: ['qbusiness:ChatSync', 'qbusiness:PutFeedback'],
                    // parametrized
                    resources: [`arn:aws:qbusiness:*:*:application/${env.AmazonQAppId}`]
                  })
                ]
              })
            }
          }),
          vpc
        })
      });
    });
  }
}
