import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { LambdaRestApi } from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { AttributeType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

import {
  AccountPrincipal,
  ArnPrincipal,
  Effect,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal
} from 'aws-cdk-lib/aws-iam';
import { StackEnvironment } from '../bin/my-amazon-q-slack-bot';

import * as fs from 'fs';
import { Key, KeyUsage } from 'aws-cdk-lib/aws-kms';

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

    const initialSlackSecretContent = JSON.stringify({
      SlackSigningSecret: '<Replace with Signing Secret>',
      SlackBotUserOAuthToken: '<Replace with Bot User OAuth Token>'
    });
    const slackSecret = new Secret(this, `${props.stackName}-Secret`, {
      secretName: `${refStackName}-Secret`,
      secretStringValue: cdk.SecretValue.unsafePlainText(initialSlackSecretContent)
    });

    const initialOIDCClientSecretContent = JSON.stringify({
      OIDCClientSecret: '<Replace with Client Secret>'
    });
    const oidcClientSecret = new Secret(this, `${props.stackName}-OidcClientCredentials`, {
      secretName: `${refStackName}-OidcClientSecret`,
      secretStringValue: cdk.SecretValue.unsafePlainText(initialOIDCClientSecretContent)
    });

    // create KMS key
    const kmsKey = new Key(this, `${props.stackName}-KmsKey`, {
      keyUsage: KeyUsage.ENCRYPT_DECRYPT,
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Output URL to the secret in the AWS Management Console
    new CfnOutput(this, `${props.stackName}-SlackSecretConsoleUrl`, {
      value: `https://${this.region}.console.aws.amazon.com/secretsmanager/secret?name=${slackSecret.secretName}&region=${this.region}`,
      description: 'Click to edit the Slack secrets in the AWS Secrets Manager console'
    });

    new CfnOutput(this, `${props.stackName}-OIDCClientSecretConsoleUrl`, {
      value: `https://${this.region}.console.aws.amazon.com/secretsmanager/secret?name=${oidcClientSecret.secretName}&region=${this.region}`,
      description: 'Click to edit the OIDC client secret in the AWS Secrets Manager console'
    });

    const OIDC_CALLBACK_API_EXPORTED_NAME = `${props.stackName}-OIDCCallbackEndpointExportedName`;
    const dynamoCache = new Table(this, `${props.stackName}-DynamoCache`, {
      tableName: `${refStackName}-channels-metadata`,
      partitionKey: {
        name: 'channel',
        type: AttributeType.STRING
      },
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expireAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const messageMetadata = new Table(this, `${props.stackName}-MessageMetadata`, {
      tableName: `${refStackName}-responses-metadata`,
      partitionKey: {
        name: 'messageId',
        type: AttributeType.STRING
      },
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'expireAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const oidcState = new Table(this, `${props.stackName}-OidcStateTable`, {
      tableName: `${refStackName}-oidc-state`,
      partitionKey: {
        name: 'state',
        type: AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl'
    });

    const iamSessionCredentials = new Table(this, `${props.stackName}-IamSessionCredentialsTable`, {
      tableName: `${refStackName}-iam-session-credentials`,
      partitionKey: {
        name: 'slackUserId',
        type: AttributeType.STRING
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl'
    });

    const qUserAPIRoleName = `${refStackName}-QBusinessRole`;
    const qUserAPIRoleARN = `arn:aws:iam::${this.account}:role/${qUserAPIRoleName}`;

    const oidcCallbackLambdaExecutionRole = new Role(
      this,
      `${props.stackName}-OIDCCallbackLambdaExecutionRole`,
      {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
        ],
        inlinePolicies: {
          SecretManagerPolicy: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: ['secretsmanager:GetSecretValue'],
                resources: [slackSecret.secretArn, oidcClientSecret.secretArn]
              })
            ]
          }),
          DynamoDBPolicy: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: ['dynamodb:DeleteItem', 'dynamodb:PutItem', 'dynamodb:GetItem'],
                resources: [oidcState.tableArn, iamSessionCredentials.tableArn]
              })
            ]
          }),
          KmsPolicy: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey'],
                resources: [kmsKey.keyArn]
              })
            ]
          }),
          SSOOIDCPolicy: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: ['sso-oauth:CreateTokenWithIAM'],
                resources: ['*'] // env.GatewayIdCAppARN
              })
            ]
          }),
          StsPolicy: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: ['sts:AssumeRole', 'sts:SetContext'],
                resources: [qUserAPIRoleARN]
              })
            ]
          }),
          CloudFormationPolicy: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: ['cloudformation:ListExports'],
                resources: ['*']
              })
            ]
          })
        }
      }
    );

    const slackLambdaExecutionRole = new Role(this, `${props.stackName}-SlackLambdaExecutionRole`, {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole')
      ],
      inlinePolicies: {
        SecretManagerPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [slackSecret.secretArn, oidcClientSecret.secretArn]
            })
          ]
        }),
        DynamoDBPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['dynamodb:DeleteItem', 'dynamodb:PutItem', 'dynamodb:GetItem'],
              resources: [
                dynamoCache.tableArn,
                messageMetadata.tableArn,
                oidcState.tableArn,
                iamSessionCredentials.tableArn
              ]
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
        }),
        SSOOIDCPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['sso-oauth:CreateTokenWithIAM'],
              resources: ['*'] // TODO use fine grained permissions
            })
          ]
        }),
        KmsPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['kms:Decrypt', 'kms:Encrypt', 'kms:GenerateDataKey'],
              resources: [kmsKey.keyArn]
            })
          ]
        }),
        StsPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['sts:AssumeRole', 'sts:SetContext'],
              resources: [qUserAPIRoleARN]
            })
          ]
        })
      }
    });

    // create a role to trust lambda roles to assume and have permissions to call qbusiness API
    const qUserAPIRole = new Role(this, `${props.stackName}-QBusinessRole`, {
      roleName: qUserAPIRoleName,
      assumedBy: new AccountPrincipal(this.account),
      inlinePolicies: {
        ChatPolicy: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ['qbusiness:ChatSync', 'qbusiness:PutFeedback'],
              resources: ['arn:aws:qbusiness:*:*:application/*']
            })
          ]
        })
      }
    });

    const trustPolicy = new PolicyStatement({
      sid: 'QGatewayTrustPolicy',
      effect: Effect.ALLOW,
      principals: [
        new ArnPrincipal(oidcCallbackLambdaExecutionRole.roleArn),
        new ArnPrincipal(slackLambdaExecutionRole.roleArn)
      ],
      actions: ['sts:AssumeRole', 'sts:SetContext']
    });
    qUserAPIRole.assumeRolePolicy?.addStatements(new PolicyStatement(trustPolicy));

    // Create OIDC callback API Gateway endpoint
    const oidcCallbackApi = new LambdaRestApi(this, `${props.stackName}-OIDCCallbackApi`, {
      handler: new lambda.NodejsFunction(this, `${props.stackName}-OIDCCallbackFn`, {
        functionName: `${refStackName}-OIDCCallback`,
        entry: 'src/functions/oidc-callback-handler.ts',
        handler: 'handler',
        description: 'Handler for OIDC callback',
        timeout: Duration.seconds(30),
        environment: {
          CFN_STACK_NAME: env.StackName,
          CALLBACK_API_ENDPOINT_EXPORTED_NAME: OIDC_CALLBACK_API_EXPORTED_NAME,
          AMAZON_Q_REGION: env.AmazonQRegion,
          OIDC_CLIENT_SECRET_NAME: oidcClientSecret.secretName,
          OIDC_STATE_TABLE_NAME: oidcState.tableName,
          IAM_SESSION_CREDENTIALS_TABLE_NAME: iamSessionCredentials.tableName,
          OIDC_IDP_NAME: env.OIDCIdPName,
          OIDC_CLIENT_ID: env.OIDCClientId,
          OIDC_ISSUER_URL: env.OIDCIssuerURL,
          KEY_ARN: kmsKey.keyArn,
          Q_USER_API_ROLE_ARN: qUserAPIRole.roleArn,
          GATEWAY_IDC_APP_ARN: env.GatewayIdCAppARN,
          AWS_IAM_IDC_REGION: env.AWSIAMIdCRegion
        },
        role: oidcCallbackLambdaExecutionRole,
        vpc
      })
    });

    new CfnOutput(this, OIDC_CALLBACK_API_EXPORTED_NAME, {
      exportName: OIDC_CALLBACK_API_EXPORTED_NAME,
      value: oidcCallbackApi.url,
      description: 'OIDC Callback API endpoint'
    });

    [
      {
        handler: 'slack-event-handler',
        id: 'SlackEventHandler',
        description: 'Handler for Slack events'
      },
      {
        handler: 'slack-interaction-handler',
        id: 'SlackInteractionHandler',
        description: 'Handler for Slack interactions'
      },
      {
        handler: 'slack-command-handler',
        id: 'SlackCommandHandler',
        description: 'Handler for Slack commands'
      }
    ].map((p) => {
      const prefix = `${props.stackName}-${p.id}`;
      new LambdaRestApi(this, `${prefix}-Api`, {
        // Keep dynamic description (with date) to ensure api is deployed on update to new template
        description: `${p.description}, Revision: ${new Date().toISOString()})`,
        deploy: true,
        handler: new lambda.NodejsFunction(this, `${prefix}-Fn`, {
          functionName: `${refStackName}-${p.id}`,
          entry: `src/functions/${p.handler}.ts`,
          handler: `handler`,
          description: `${p.description}, Revision: ${new Date().toISOString()})`,
          timeout: Duration.seconds(30),
          environment: {
            SLACK_SECRET_NAME: slackSecret.secretName,
            OIDC_CLIENT_SECRET_NAME: oidcClientSecret.secretName,
            AMAZON_Q_REGION: env.AmazonQRegion,
            AMAZON_Q_APP_ID: env.AmazonQAppId,
            CONTEXT_DAYS_TO_LIVE: env.ContextDaysToLive,
            CACHE_TABLE_NAME: dynamoCache.tableName,
            MESSAGE_METADATA_TABLE_NAME: messageMetadata.tableName,
            OIDC_STATE_TABLE_NAME: oidcState.tableName,
            IAM_SESSION_CREDENTIALS_TABLE_NAME: iamSessionCredentials.tableName,
            OIDC_IDP_NAME: env.OIDCIdPName,
            OIDC_CLIENT_ID: env.OIDCClientId,
            OIDC_ISSUER_URL: env.OIDCIssuerURL,
            OIDC_REDIRECT_URL: oidcCallbackApi.url,
            KEY_ARN: kmsKey.keyArn,
            Q_USER_API_ROLE_ARN: qUserAPIRole.roleArn,
            GATEWAY_IDC_APP_ARN: env.GatewayIdCAppARN,
            AWS_IAM_IDC_REGION: env.AWSIAMIdCRegion
          },
          role: slackLambdaExecutionRole,
          vpc
        })
      });
    });
  }
}
