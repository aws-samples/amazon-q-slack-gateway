#!/bin/bash

# Ensure required arguments are passed
if [ $# -lt 2 ]; then
    echo "Usage: $0 <oidc_client_id> <trusted-token-issuer-arn> [application_name]"
    exit 1
else
    OIDC_CLIENT_ID="$1"
    TTI_ARN="$2"
    if [ -n "$3" ]; then
            APPLICATION_NAME="$3"
        else
            APPLICATION_NAME="AmazonQSlackGateway"
        fi
fi

# Retrieve AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
if [ $? -ne 0 ]; then
    echo "Failed to retrieve AWS account ID."
    exit 1
fi

# Retrieve the IdC instance ARN.
IDC_INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' | tr -d '""')
if [ $? -ne 0 ] || [ -z "$IDC_INSTANCE_ARN" ]; then
    echo "Error: IDC_INSTANCE_ARN is empty or failed to retrieve. Please check your AWS SSO configuration."
    exit 1
fi

# Check if the application already exists
echo "Checking if the $APPLICATION_NAME exists..."
APPLICATION_EXISTS=0
GATEWAY_IDC_ARN=""
RESPONSE=$(aws sso-admin list-applications --instance-arn $IDC_INSTANCE_ARN --query 'Applications[*].ApplicationArn' | tr -d '[",]')
for ARN in $RESPONSE; do
    CURRENT_NAME=$(aws sso-admin describe-application --application-arn $ARN --query 'Name' | tr -d '"')
    if [ "$CURRENT_NAME" == "$APPLICATION_NAME" ]; then
        GATEWAY_IDC_ARN=$ARN
        APPLICATION_EXISTS=1
        echo "$APPLICATION_NAME already exists with GATEWAY_IDC_ARN: $GATEWAY_IDC_ARN"
        break
    fi
done

# Create the application if it does not exist
CUSTOM_APPLICATION_PROVIDER_ARN="arn:aws:sso::aws:applicationProvider/custom"
if [ $APPLICATION_EXISTS -eq 0 ]; then
  echo "Creating $APPLICATION_NAME..."
    GATEWAY_IDC_ARN=$(aws sso-admin create-application --application-provider-arn $CUSTOM_APPLICATION_PROVIDER_ARN --instance-arn $IDC_INSTANCE_ARN --name "$APPLICATION_NAME" --query 'ApplicationArn' | tr -d '"')
    if [ $? -ne 0 ] || [ -z "$GATEWAY_IDC_ARN" ]; then
        echo "Error: GATEWAY_IDC_ARN could not be created. Please check your inputs and AWS permissions."
        exit 1
    fi
    echo "Created GATEWAY_IDC_ARN: $GATEWAY_IDC_ARN"
fi

# Disable assignment
aws sso-admin put-application-assignment-configuration --application-arn $GATEWAY_IDC_ARN --no-assignment-required
if [ $? -ne 0 ]; then
    echo "Failed to disable assignment for the application."
    exit 1
fi

# Put grant
json_input='{
    "ApplicationArn": "'$GATEWAY_IDC_ARN'",
    "Grant": {
        "JwtBearer": {
            "AuthorizedTokenIssuers": [
                {
                    "AuthorizedAudiences": [
                        "'$OIDC_CLIENT_ID'"
                    ],
                    "TrustedTokenIssuerArn": "'$TTI_ARN'"
                }
            ]
        }
    },
    "GrantType": "urn:ietf:params:oauth:grant-type:jwt-bearer"
}'
aws sso-admin put-application-grant --cli-input-json "$json_input"
if [ $? -ne 0 ]; then
    echo "Failed to put application grant."
    exit 1
fi

# Put application authentication method
json_input='{
    "ApplicationArn": "'$GATEWAY_IDC_ARN'",
    "AuthenticationMethod": {
        "Iam": {
            "ActorPolicy": {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {
                            "AWS": "'$AWS_ACCOUNT_ID'"
                        },
                        "Action": "sso-oauth:CreateTokenWithIAM",
                        "Resource": "*"
                    }
                ]
            }
        }
    },
    "AuthenticationMethodType": "IAM"
}'
aws sso-admin put-application-authentication-method --cli-input-json "$json_input"
if [ $? -ne 0 ]; then
    echo "Failed to set authentication method."
    exit 1
fi

# Put application access scopes
if ! aws sso-admin put-application-access-scope --application-arn $GATEWAY_IDC_ARN --scope "qbusiness:conversations:access"; then
    echo "Failed to set access scope for conversations."
    exit 1
fi
if ! aws sso-admin put-application-access-scope --application-arn $GATEWAY_IDC_ARN --scope "qbusiness:messages:access"; then
    echo "Failed to set access scope for messages."
    exit 1
fi

# Echo GATEWAY_IDC_ARN at the end
echo "$APPLICATION_NAME is setup with GATEWAY_IDC_ARN: $GATEWAY_IDC_ARN"
