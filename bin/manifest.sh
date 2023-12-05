#!/bin/bash

#
# helper script called by $ROOT/deploy.sh - updates slack manifest file with URLs from stack output
#

# Exit on error
set -e

# The path to the JSON file containing the stack name (= bot name)
ENVIRONMENT_FILE="environment.json"

# The path to the JSON file containing the stack output keys and values
CDK_OUT_FILE="cdk-outputs.json"

# The path to the original template manifest file
TEMPLATE_FILE="slack-manifest-template.json"

# The path to the new output manifest file
OUTPUT_FILE="slack-manifest-output.json"

# Extract the StackName from environment file
STACKNAME=$(jq -r ".StackName" "$ENVIRONMENT_FILE" 2> /dev/null)

# Extract the API Endpoint Urls based on the known substrings using jq
CDK_OUT_CONTENT=$(<"$CDK_OUT_FILE")
SLACK_EVENT_HANDLER_API_OUTPUT=$(echo "$CDK_OUT_CONTENT" | jq -r '.[] | to_entries[] | select(.key | contains("SlackEventHandlerApiEndpoint")) | .value')
SLACK_INTERACTION_HANDLER_API_OUTPUT=$(echo "$CDK_OUT_CONTENT" | jq -r '.[] | to_entries[] | select(.key | contains("SlackInteractionHandlerApiEndpoint")) | .value')
SLACK_COMMAND_HANDLER_API_OUTPUT=$(echo "$CDK_OUT_CONTENT" | jq -r '.[] | to_entries[] | select(.key | contains("SlackCommandHandlerApiEndpoint")) | .value')
SLACK_SECRET_URL_OUTPUT=$(echo "$CDK_OUT_CONTENT" | jq -r '.[] | to_entries[] | select(.key | contains("SlackSecretConsoleUrl")) | .value')

# Use sed to replace the tokens with the extracted values in the template file and write to the new file
if sed --version 2>/dev/null | grep -q GNU; then # GNU sed
    sed "s|\"!!! \[SlackBotName\] !!!\"|\"$STACKNAME\"|g" "$TEMPLATE_FILE" > "$OUTPUT_FILE"
    sed -i "s|\"!!! \[SlackEventHandlerApiOutput\] !!!\"|\"$SLACK_EVENT_HANDLER_API_OUTPUT\"|g" "$OUTPUT_FILE"
    sed -i "s|\"!!! \[SlackInteractionHandlerApiOutput\] !!!\"|\"$SLACK_INTERACTION_HANDLER_API_OUTPUT\"|g" "$OUTPUT_FILE"
    sed -i "s|\"!!! \[SlackCommandApiOutput\] !!!\"|\"$SLACK_COMMAND_HANDLER_API_OUTPUT\"|g" "$OUTPUT_FILE"
else
    sed "s|\"!!! \[SlackBotName\] !!!\"|\"$STACKNAME\"|g" "$TEMPLATE_FILE" > "$OUTPUT_FILE"
    sed -i "" "s|\"!!! \[SlackEventHandlerApiOutput\] !!!\"|\"$SLACK_EVENT_HANDLER_API_OUTPUT\"|g" "$OUTPUT_FILE"
    sed -i "" "s|\"!!! \[SlackInteractionHandlerApiOutput\] !!!\"|\"$SLACK_INTERACTION_HANDLER_API_OUTPUT\"|g" "$OUTPUT_FILE"
    sed -i "" "s|\"!!! \[SlackCommandApiOutput\] !!!\"|\"$SLACK_COMMAND_HANDLER_API_OUTPUT\"|g" "$OUTPUT_FILE"
fi

# Display a message to show completion
echo "Slack app manifest created: $OUTPUT_FILE."

# Output URL to Secrets Manager
echo URL for your slack bot secrets: $SLACK_SECRET_URL_OUTPUT

