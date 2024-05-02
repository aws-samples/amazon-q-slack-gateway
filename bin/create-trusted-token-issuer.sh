#!/bin/bash

# Ensure required arguments are passed
if [ $# -lt 1 ]; then
    echo "Usage: $0 <oidc_issuer_url>"
    exit 1
fi

OIDC_ISSUER_URL="$1"

# Retrieve the IdC instance ARN.
IDC_INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' | tr -d '"')

# Check if there is TTI_ARN for the issuer url.
for arn in $(aws sso-admin list-trusted-token-issuers --instance-arn "$IDC_INSTANCE_ARN" --query 'TrustedTokenIssuers[].TrustedTokenIssuerArn[]' | tr -d '[",]')
do
    current_issuer_url=$(aws sso-admin describe-trusted-token-issuer --trusted-token-issuer-arn $arn --query 'TrustedTokenIssuerConfiguration.OidcJwtConfiguration.IssuerUrl' --output text)
    if [[ "$current_issuer_url" == "$OIDC_ISSUER_URL" ]]
    then
        echo "Trusted token issuer already exists for $OIDC_ISSUER_URL, ARN: $arn"
        exit 0
    fi
done

# Create Trusted token issuer
TTI_ARN=$(aws sso-admin create-trusted-token-issuer --cli-input-json '{
    "InstanceArn": '\"$IDC_INSTANCE_ARN\"',
    "Name": "okta-issuer",
    "TrustedTokenIssuerConfiguration": {
        "OidcJwtConfiguration": {
            "ClaimAttributePath": "email",
            "IdentityStoreAttributePath": "emails.value",
            "IssuerUrl": '\"$OIDC_ISSUER_URL\"',
            "JwksRetrievalOption": "OPEN_ID_DISCOVERY"
        }
    },
    "TrustedTokenIssuerType": "OIDC_JWT"
}' --query 'TrustedTokenIssuerArn' | tr -d '"')

echo "TTI_ARN=$TTI_ARN"
