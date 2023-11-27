# Slack gateway for Amazon Q (preview)

Amazon Q is a new generative AI-powered application that helps users get work done. Use Amazon Q to discover content, brainstorm ideas, or create summaries using your company’s data safely and securely without needing to have any generative AI expertise. For more information see: [Introducing Amazon Q, a new generative AI-powered assistant (preview)](https://aws.amazon.com/blogs/aws/introducing-amazon-q-a-new-generative-ai-powered-assistant-preview)

In this repo we share a project which lets you bring the power of Amazon Q to your users where they already spend a lot of their time collaborating with colleagues... on Slack. Now they can collaborate with Amazon Q as well! It allows your users to:
- Converse with Amazon Q using Slack Direct Message (DM) to ask questions based on company data, get help creating new content and performing tasks. 
- You can also invite it to participate in your team channels. 
  - In a channel users can ask it questions in a new message, or tag it in a thread at any point. Get it to provide additional data points, resolve a debate, or summarize the conversation and capture next steps. 

It's amazingly powerful. Here's a demo - seeing is believing!
 

https://github.com/aws-samples/amazon-q-slack-gateway/assets/10953374/6902a9ea-7a24-4e00-bd41-e1029d0f58e4


It's easy to deploy in your own AWS Account, and add to your own Slack Workspace. We show you how below.

### Features
- In DMs it responds to all messages
- In channels it responds only to @mentions, and always replies in thread
- Renders answers containing markdown - e.g. headings, lists, bold, italics, tables, etc. 
- Provides thumbs up / down buttons to track user sentiment and help improve performance over time
- Provides Source Attribution - see references to sources used by Amazon Q
- Aware of conversation context - it tracks the conversation and applies context
- Aware of multiple users - when it's tagged in a thread, it knows who said what, and when - so it can contribute in context and accurately summarize the thread when asked.  
- Process up to 5 attached files for document question answering, summaries, etc.
- Reset and start new conversation in DM channel by using `/new_conversation`

This sample Amazon Q slack application is provided as open source — use it as a starting point for your own solution, and help us make it better by contributing back fixes and features via GitHub pull requests. Explore the code, choose Watch to be notified of new releases, and check back for the latest  updates.

![Slack Demo](./images/thread-demo.png)

Follow the instructions below to deploy the project to your own AWS account and Slack workspace, and start experimenting!

## Deploy the solutiom

### 1. Dependencies

You need to have the following packages installed on your computer to build and deploy the project.

1. bash shell (Linux, MacOS, Windows-WSL)
2. node and npm: https://docs.npmjs.com/downloading-and-installing-node-js-and-npm 
3. tsc (typescript): `npm install -g typescript`
4. esbuild: `npm i -g esbuild`
5. jq: https://jqlang.github.io/jq/download/
6. aws (AWS CLI): https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html 
7. cdk (AWS CDK): https://docs.aws.amazon.com/cdk/v2/guide/cli.html

### 2. Initialize and deploy the stack

Copy the GitHub repo to your computer. Either:
- use the git command: git clone https://github.com/aws-samples/amazon-q-slack-gateway.git
- OR, download and expand the ZIP file from the GitHub page: https://github.com/aws-samples/amazon-q-slack-gateway/archive/refs/heads/main.zip

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
5. Replace secret value with the following JSON and replace with the value of `Signing Secret` and `Bot User OAuth Token`, you will find those values in the Slack application configuration under `Basic Information` and `OAuth & Permissions`:
```
{
  "SlackSigningSecret": "VALUE_HERE",
  "SlackBotUserOAuthToken": "VALUE_HERE"
}
 ```

### Say hello
> Time to say Hi!

1. Go to Slack
2. Under Apps > Manage, add your new Amazon Q app
3. Optionally add your app to team channels
4. In the app DM channel, say *Hello*. In a team channel, ask it for help with an @mention.
5. Enjoy.

## Contributing, and reporting issues

We welcome your contributions to our project. Whether it's a bug report, new feature, correction, or additional
documentation, we greatly value feedback and contributions from our community.

See [CONTRIBUTING](CONTRIBUTING.md) for more information.

## Security

See [Security issue notifications](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the [LICENSE](./LICENSE) file.