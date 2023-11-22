import * as cdk from 'aws-cdk-lib';
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
import { StackEnvironment } from '../bin/my-enterprise-q-slack-bot';

import * as fs from 'fs';
const version = fs.readFileSync('VERSION', 'utf-8').trim();
const STACK_DESCRIPTION = `Amazon Q Slack Gateway - v${version}`;

export class MyEnterpriseQSlackBotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps, env: StackEnvironment) {
    super(scope, id, {
      ...props,
      description: STACK_DESCRIPTION 
    });

    const vpc = new Vpc(this, `${props.stackName}-VPC`);

    const slackSecret = new Secret(this, `${props.stackName}-Secret`, {
      secretName: `${props.stackName}-Secret`
    });

    const dynamoCache = new Table(this, `${props.stackName}-DynamoCache`, {
      tableName: `${env.StackName}-channels-metadata`,
      partitionKey: {
        name: 'channel',
        type: AttributeType.STRING
      },
      timeToLiveAttribute: 'expireAt'
    });

    const messageMetadata = new Table(this, `${props.stackName}-MessageMetadata`, {
      tableName: `${env.StackName}-responses-metadata`,
      partitionKey: {
        name: 'messageId',
        type: AttributeType.STRING
      },
      timeToLiveAttribute: 'expireAt'
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
          entry: `src/functions/${p.handler}.ts`,
          handler: `handler`,
          description: `${p.description} (Stack: ${
            props.stackName
          }, Revision: ${new Date().toISOString()})`,
          timeout: Duration.seconds(30),
          environment: {
            SLACK_SECRET_NAME: slackSecret.secretName,
            ENTERPRISE_Q_ENDPOINT: env.EnterpriseQEndpoint ?? '',
            ENTERPRISE_Q_REGION: env.EnterpriseQRegion,
            ENTERPRISE_Q_APP_ID: env.EnterpriseQAppId,
            ENTERPRISE_Q_USER_ID: env.EnterpriseQUserId ?? '',
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
                    actions: [
                      'dynamodb:DeleteItem',
                      'dynamodb:PutItem',
                      'dynamodb:GetItem'
                    ],
                    resources: [dynamoCache.tableArn, messageMetadata.tableArn]
                  })
                ]
              }),
              ChatPolicy: new PolicyDocument({
                statements: [
                  new PolicyStatement({
                    actions: ['enterpriseq:ChatSync', 'enterpriseq:PutFeedback'],
                    // parametrized
                    resources: [`arn:aws:enterpriseq:*:*:application/${env.EnterpriseQAppId}`]
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
