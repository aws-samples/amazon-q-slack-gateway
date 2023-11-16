#!/bin/bash

#
# helper script called by $ROOT/init.sh - interactively create environment.json
#

json_file="environment.json"

prompt_for_value() {
  local value
  local existing_value
  local default_value
  local regex
  local message
  local var_name

  var_name=$1
  message=$2
  default_value=$3
  regex=$4
  existing_value=$(jq -r ".$var_name" "$json_file" 2> /dev/null)

  # override default_value with any existing value
  if [ -n "$existing_value" ]; then
    default_value=$existing_value
  fi

  # Prompt the user for input or to accept default. If default is "none" force user to enter a value
  while true; do

    read -p "$message [$default_value]: " value

    if [ -z "$value" ] && [ "$default_value" == "none" ]; then
      # user did not enter a value, but it's required
      echo "No default. Please enter a value." >&2
    elif [ -z "$value" ]; then
      # user did not enter a value, but it's not required.. use default
      value=$default_value
      break
    elif [[ $value =~ $regex ]]; then
      # value matches the regex - all good.
      break
    else 
      # value does not match the regex.. ask user to try again
      echo "Value entered does not match required regex: $regex. Please enter a valid value." >&2
    fi
  done

  echo $value
}

# Read or update values
stack_name=$(prompt_for_value "StackName" "Name for slack bot" "EnterpriseQBot" "^[A-Za-z][A-Za-z0-9-]{0,127}$")
user_id=$(prompt_for_value "EnterpriseQUserId" "Enterprise Q User ID" "EnterpriseQBotUser" "^[^[:space:]]{1,2048}$")
app_id=$(prompt_for_value "EnterpriseQAppId" "Enterprise Q Application ID (copy from AWS console)" "none" "^[a-zA-Z0-9][a-zA-Z0-9-]{35}$")
region=$(prompt_for_value "EnterpriseQRegion" "Enterprise Q Region" $(aws configure get region) "^[a-z]{2}-[a-z]+-[0-9]+$")
endpoint=$(prompt_for_value "EnterpriseQEndpoint" "Enterprise Q Endpoint (leave empty for default endpoint)" "" "^(https:\/\/\S+)?$")

# Create or update the JSON file
jq -n \
  --arg stack_name "$stack_name" \
  --arg app_id "$app_id" \
  --arg region "$region" \
  --arg user_id "$user_id" \
  --arg endpoint "$endpoint" \
  '{
    StackName: $stack_name,
    EnterpriseQAppId: $app_id,
    EnterpriseQUserId: $user_id,
    EnterpriseQRegion: $region,
    EnterpriseQEndpoint: $endpoint
  }' > "$json_file"

echo "Configuration saved to $json_file"
