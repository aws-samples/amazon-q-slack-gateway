# Developer README

The main README is here: [Slack gateway for Amazon Q, your business expert (preview)](./README.md)

This Developer README describes how to build the project from the source code - for developer types. You can:
- [Deploy the solution](#deploy-the-solution)
- [Publish the solution](#publish-the-solution)

### 1. Dependencies

To deploy or to publish, you need to have the following packages installed on your computer:

1. bash shell (Linux, MacOS, Windows-WSL)
2. node and npm: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm 
3. tsc (typescript): `npm install -g typescript`
4. esbuild: `npm i -g esbuild`
5. jq: https://jqlang.github.io/jq/download/
6. aws (AWS CLI): https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html 
7. cdk (AWS CDK): https://docs.aws.amazon.com/cdk/v2/guide/cli.html

Copy the GitHub repo to your computer. Either:
- use the git command: git clone https://github.com/aws-samples/amazon-q-slack-gateway.git
- OR, download and expand the ZIP file from the GitHub page: https://github.com/aws-samples/amazon-q-slack-gateway/archive/refs/heads/main.zip

### 2. Prerequisites

1. You need to have an AWS account and an IAM Role/User with permissions to create and manage the necessary resources and components for this application. *(If you do not have an AWS account, please see [How do I create and activate a new Amazon Web Services account?](https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/))*

2. You need to have an Okta Workforce Identity Cloud account. If you haven't signed up yet, see [Signing up for Okta](https://www.okta.com/)

3. You need to configure SAML and SCIM with Okta and IAM Identity Center. If you haven't configured, see [Configuring SAML and SCIM with Okta and IAM Identity Center](https://docs.aws.amazon.com/singlesignon/latest/userguide/gs-okta.html)

4. You also need to have an existing, working Amazon Q business application integrated with IdC. If you haven't set one up yet, see [Creating an Amazon Q application](https://docs.aws.amazon.com/amazonq/latest/business-use-dg/create-app.html)

5. You need to have users subscribed to your Amazon Q business application, and are able to access Amazon Q Web Experience. If you haven't set one up yet, see [Subscribing users to an Amazon Q application](https://docs.aws.amazon.com/amazonq/latest/qbusiness-ug/adding-users-groups.html)


## Deploy the solution

### 1. Setup

#### 1.1 Create an OIDC app integration, for the gateway, in Okta.

Create the client as a ['Web app'](https://help.okta.com/en-us/content/topics/apps/apps_app_integration_wizard_oidc.htm). You will want to enable the 'Refresh Token' grant type, 'Allow everyone in your organization to access', and 'Federation Broker Mode'. Use a placeholder URL, like ```https://example.com```, for the redirect URI, as you will update this later (in step 3).

#### 1.2 Create Trusted token issuer in IAM Identity Center

Create trusted token issuer to trust tokens from OIDC issuer URL using these instructions listed here - https://docs.aws.amazon.com/singlesignon/latest/userguide/using-apps-with-trusted-token-issuer.html.
Or you can run the below script.

For the script, you need to have the OIDC issuer URL and the AWS region in which you have your Q business application. To retrieve the OIDC issuer URL, go to Okta account console, click the left hamburger menu and open Security > API and copy the whole 'Issuer URI'.

The script will output trusted token issuer ARN which you will use in the next step.

```
 export AWS_DEFAULT_REGION=<>
 OIDC_ISSUER_URL=<>
 bin/create-trusted-token-issuer.sh $OIDC_ISSUER_URL
```

#### 1.3 Create Customer managed application in IAM Identity Center

Create customer managed IdC application by running below script.

For the script, you need to have the OIDC client ID, trusted token issuer ARN, and the region in which you have your Q business application. To retrieve the OIDC client ID, go to Okta account console, click the left hamburger menu and open Applications > Applications and click on the application you created in step 1.1. Copy the 'Client ID'. For TTI_ARN, you can use the output from the previous step.

The script will output the IdC application ARN which you will use in the next step.

```
 export AWS_DEFAULT_REGION=<>
 OIDC_CLIENT_ID=<>
 TTI_ARN=<>
 bin/create-idc-application.sh $OIDC_CLIENT_ID $TTI_ARN
```

Before starting, you need to have an existing, working Amazon Q application. If you haven't set one up yet, see [Creating an Amazon Q application](https://docs.aws.amazon.com/amazonq/latest/business-use-dg/create-app.html)

### 2. Initialize and deploy the stack

Navigate into the project root directory and, in a bash shell, run:

1. `./init.sh` - checks your system dependendencies for required packages (see Dependencies above), sets up your environment file, and bootstraps your cdk environment.
2. `./deploy.sh` - runs the cdk build and deploys or updates a stack in your AWS account, creates a slack app manifest file, and outputs a link to the AWS Secrets Manager secret that you will need below.

### 3. Update OIDC Client Redirect URL.

Go the app client settings created in Okta (in step 1.1), and update the client redirect URL with exported value in Cloudformation stack for `OIDCCallbackEndpointExportedName`.

### 4. Configure your Slack application

#### 4.1 Create your app

Now you can create your new app in Slack!  
*NOTE: If you have deployed the Slack data source connector for Amazon Q you may already have an existing Slack app installed. Do not attempt to modify that data source connector app - create a new app instead.*

1. Create a Slack app: https://api.slack.com/apps from the generated manifest - copy / paste from the stack output: `SlackAppManifest`.
2. Go to `App Home`, scroll down to the section `Show Tabs` and enable `Message Tab` then check the box `Allow users to send Slash commands and messages from the messages tab` - This is a required step to enable your user to send messages to your app

#### 4.2 Add your app in your workspace

Let's now add your app into your workspace, this is required to generate the `Bot User OAuth Token` value that will be needed in the next step

1. Go to OAuth & Permissions (in api.slack.com) and click `Install to Workspace`, this will generate the OAuth token
2. In Slack, go to your workspace
2. Click on your workspace name > Tools and settings > Manage apps
3. Click on your newly created app
4. In the right pane, click on "Open in App Directory"
5. Click "Open in Slack"

### 4.3 Configure your Secrets in AWS

#### 4.3.1 Configure your Slack secrets in order to (1) verify the signature of each request, (2) post on behalf of your bot

> **IMPORTANT**
> In this example we are not enabling Slack token rotation. Enable it for a production app by implementing
> rotation via AWS Secrets Manager.
> Please create an issue (or, better yet, a pull request!) in this repo if you want this feature added to a future version.

1. Login to your AWS console
2. In your AWS account go to Secret manager, using the URL shown in the stack output: `SlackSecretConsoleUrl`.
3. Choose `Retrieve secret value`
4. Choose `Edit`
5. Replace the value of `Signing Secret`<sup>\*</sup> and `Bot User OAuth Token`, you will find those values in the Slack application configuration under `Basic Information` and `OAuth & Permissions`. <sup>\*</sup>*(Pro tip: Be careful you don't accidentally copy 'Client Secret' (wrong) instead of 'Signing Secret' (right)!)*

3. Update OIDC Client Redirect URL.

#### 4.3.2 Configure OIDC Client Secret in order to exchange the code for token

1. Login to your AWS console
2. In your AWS account go to Secret manager, using the URL shown in the stack output: `OIDCClientSecretConsoleUrl`.
3. Choose `Retrieve secret value`
4. Choose `Edit`
5. Replace the value of `OidcClientSecret`, you will find those values in the IdP app client configuration.

### Say hello
> Time to say Hi!

1. Go to Slack
2. Under Apps > Manage, add your new Amazon Q app
3. Optionally add your app to team channels
4. In the app DM channel, say *Hello*. In a team channel, ask it for help with an @mention.
5. You'll be prompted to Sign In with your Okta credentials to authenticate with Amazon Q. Click the button to sign in.
   ![Slack Sign In](./images/sign-in-demo.png)
6. You'll be redirected to browser to sign in with Okta. Once you sign in, you can close the browser window and return to Slack.
7. You're now authenticated and can start asking questions!
8. Enjoy.

## Publish the solution

In our main README, you will see that we provided Easy Deploy Buttons to launch a stack using pre-built templates that we published already to an S3 bucket. 

If you want to build and publish your own template, to your own S3 bucket, so that others can easily use a similar easy button approach to deploy a stack, using *your* templates, here's how.

Navigate into the project root directory and, in a bash shell, run:

1. `./publish.sh <cfn_bucket_basename> <cfn_prefix> <us-east-1 | us-west-2>`.  
  This:
    - checks your system dependendencies for required packages (see Dependencies above)
    - bootstraps your cdk environment if needed
    - creates a standalone CloudFormation template (that doesn't depend on CDK)
    - publishes the template and required assets to an S3 bucket in your account called `cfn_bucket_basename-region` (it creates the bucket if it doesn't already exist)
    - optionally add a final parameter `public` if you want to make the templates public. Note: your bucket and account must be configured not to Block Public Access using new ACLs.

That's it! There's just one step.
  
When completed, it displays the CloudFormation templates S3 URLs and 1-click URLs for launching the stack creation in CloudFormation console, e.g.:
```
OUTPUTS
Template URL: https://s3.us-east-1.amazonaws.com/yourbucketbasename-us-east-1/qslack-test/AmazonQSlackGateway.json
CF Launch URL: https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/create/review?templateURL=https://s3.us-east-1.amazonaws.com/yourbucketbasename-us-east-1/qslack-test/AmazonQSlackGateway.json&stackName=AMAZON-Q-SLACK-GATEWAY
Done
``````

Follow the deployment directions in the main [README](./README.md), but use your own CF Launch URL instead of our pre-built templates (Launch Stack buttons). 


## Contributing, and reporting issues

We welcome your contributions to our project. Whether it's a bug report, new feature, correction, or additional
documentation, we greatly value feedback and contributions from our community.

See [CONTRIBUTING](CONTRIBUTING.md) for more information.

## Security

See [Security issue notifications](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](./LICENSE) file.
