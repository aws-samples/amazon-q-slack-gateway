# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2023-12-04
### Added
 - New 'Easy Button' option for deployment and update using pre-built CloudFormation templates (with no dependency on dev shell, cdk, etc.) - see [README - Deploy the stack](./README.md#1-deploy-the-stack).
 - New `publish.sh` script used to create and publish standalone CloudFormation templates in an S3 bucket - see [README_DEVELOPERS - Publish the solution](./README_DEVELOPERS.md#publish-the-solution).

## [0.1.0] - 2023-11-27
### Added
Initial release
- In DMs it responds to all messages
- In channels it responds only to @mentions, and always replies in thread
- Renders answers containing markdown - e.g. headings, lists, bold, italics, tables, etc. 
- Provides thumbs up / down buttons to track user sentiment and help improve performance over time
- Provides Source Attribution - see references to sources used by Amazon Q
- Aware of conversation context - it tracks the conversation and applies context
- Aware of multiple users - when it's tagged in a thread, it knows who said what, and when - so it can contribute in context and accurately summarize the thread when asked.  
- Process up to 5 attached files for document question answering, summaries, etc.
- Reset and start new conversation in DM channel by using `/new_conversation`

[Unreleased]: https://github.com/aws-samples/qnabot-on-aws-plugin-samples/compare/v0.1.1...develop
[0.1.1]: https://github.com/aws-samples/qnabot-on-aws-plugin-samples/releases/tag/v0.1.1
[0.1.0]: https://github.com/aws-samples/qnabot-on-aws-plugin-samples/releases/tag/v0.1.0
