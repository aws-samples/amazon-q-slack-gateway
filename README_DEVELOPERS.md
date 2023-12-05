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

## Deploy the solution

Before starting, you need to have an existing, working Amazon Q application. If you haven't set one up yet, see [Creating an Amazon Q application](https://docs.aws.amazon.com/amazonq/latest/business-use-dg/create-app.html)

### 1. Initialize and deploy the stack

Navigate into the project root directory and, in a bash shell, run:

1. `./init.sh` - checks your system dependendencies for required packages (see Dependencies above), sets up your environment file, and bootstraps your cdk environment.
2. `./deploy.sh` - runs the cdk build and deploys or updates a stack in your AWS account, creates a slack app manifest file, and outputs a link to the AWS Secrets Manager secret that you will need below.

### 3. Configure your Slack application

#### 3.2 Create your app

Now you can create your app in Slack!

1. Create a Slack app: https://api.slack.com/apps from the generated manifest `./slack-manifest-output.json` (copy / paste)
2. Go to `App Home`, scroll down to the section `Show Tabs` and enable `Message Tab` then check the box `Allow users to send Slash commands and messages from the messages tab` - This is a required step to enable your user to send messages to your app

#### 3.3 Add your app in your workspace

Let's now add your app into your workspace, this is required to generate the `Bot User OAuth Token` value that will be needed in the next step

1. Go to OAuth & Permissions (in api.slack.com) and click `Install to Workspace`, this will generate the OAuth token
2. In Slack, go to your workspace
2. Click on your workspace name > Settings & administration > Manage apps
3. Click on your newly created app
4. In the right pane, click on "Open in App Directory"
5. Click "Open in Slack"

### 4. Configure your Secrets in AWS

Let's configure your Slack secrets in order to (1) verify the signature of each request, (2) post on behalf of your bot

> **IMPORTANT**
> In this example we are not enabling Slack token rotation. Enable it for a production app by implementing
> rotation via AWS Secrets Manager. 
> Please create an issue (or, better yet, a pull request!) in this repo if you want this feature added to a future version.

1. Login to your AWS console
2. In your AWS account go to Secret manager, using the URL that was output by the `deploy.sh` script above. 
3. Choose `Retrieve secret value`
4. Choose `Edit`
5. Replace the value of `Signing Secret` and `Bot User OAuth Token`, you will find those values in the Slack application configuration under `Basic Information` and `OAuth & Permissions`:

### Say hello
> Time to say Hi!

1. Go to Slack
2. Under Apps > Manage, add your new Amazon Q app
3. Optionally add your app to team channels
4. In the app DM channel, say *Hello*. In a team channel, ask it for help with an @mention.
5. Enjoy.


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