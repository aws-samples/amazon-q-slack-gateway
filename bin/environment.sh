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
  if [ -n "$existing_value" ] && [ "$existing_value" != "null" ]; then
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
stack_name=$(prompt_for_value "StackName" "Name for slack bot" "AmazonQBot" "^[A-Za-z][A-Za-z0-9-]{0,127}$")
# From Bash 3 - testing with MacOS - m and n must be in the range from 0 to RE_DUP_MAX (default 255), inclusive.
user_id=$(prompt_for_value "AmazonQUserId" "Amazon Q User ID (leave empty to use slack users' email as user Id)" "" "^[^[:space:]]{0,255}$")
app_id=$(prompt_for_value "AmazonQAppId" "Amazon Q Application ID (copy from AWS console)" "none" "^[a-zA-Z0-9][a-zA-Z0-9-]{35}$")
region=$(prompt_for_value "AmazonQRegion" "Amazon Q Region" $(aws configure get region) "^[a-z]{2}-[a-z]+-[0-9]+$")
endpoint=$(prompt_for_value "AmazonQEndpoint" "Amazon Q Endpoint (leave empty for default endpoint)" "" "https://[-[:alnum:]\+&@#/%?=~_|!:,.;]+")
ttl_days=$(prompt_for_value "ContextDaysToLive" "Number of days to keep conversation context" "90" "^[1-9][0-9]{0,3}$")

# Create or update the JSON file
cp $json_file $json_file.bak 2> /dev/null
jq -n \
  --arg stack_name "$stack_name" \
  --arg app_id "$app_id" \
  --arg region "$region" \
  --arg user_id "$user_id" \
  --arg endpoint "$endpoint" \
  --arg ttl_days "$ttl_days" \
  '{
    StackName: $stack_name,
    AmazonQAppId: $app_id,
    AmazonQUserId: $user_id,
    AmazonQRegion: $region,
    AmazonQEndpoint: $endpoint,
    ContextDaysToLive: $ttl_days
  }' > "$json_file"

echo "Configuration saved to $json_file"
