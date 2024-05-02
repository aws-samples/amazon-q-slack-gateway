#!/bin/bash

##############################################################################################
# Create new Cfn artifacts bucket if not already existing
# Build artifacts and template with CDK
# Convert templates from CDK dependent to standalone
# Upload artifacts to S3 bucket for deployment with CloudFormation
##############################################################################################

# Stop the publish process on failures
set -e

USAGE="$0 <cfn_bucket_basename> <cfn_prefix> <region> [public]"

BUCKET_BASENAME=$1
[ -z "$BUCKET_BASENAME" ] && echo "Cfn bucket name is a required parameter. Usage $USAGE" && exit 1

PREFIX=$2
[ -z "$PREFIX" ] && echo "Prefix is a required parameter. Usage $USAGE" && exit 1

REGION=$3
[ -z "$REGION" ] && echo "Region is a required parameter. Usage $USAGE" && exit 1
export AWS_DEFAULT_REGION=$REGION

ACL=$4
if [ "$ACL" == "public" ]; then
  echo "Published S3 artifacts will be acessible by public (read-only)"
  PUBLIC=true
else
  echo "Published S3 artifacts will NOT be acessible by public."
  PUBLIC=false
fi

# Remove trailing slash from prefix if needed, and append VERSION
VERSION=$(jq -r '.version' package.json)
[[ "${PREFIX}" == */ ]] && PREFIX="${PREFIX%?}"
PREFIX_AND_VERSION=${PREFIX}/${VERSION}
echo $PREFIX_AND_VERSION

# Append region to bucket basename
BUCKET=${BUCKET_BASENAME}-${REGION}

echo "Running precheck..."
./bin/precheck.sh

# Create bucket if it doesn't already exist
if [ -x $(aws s3api list-buckets --query 'Buckets[].Name' | grep "\"$BUCKET\"") ]; then
  echo "Creating s3 bucket: $BUCKET"
  aws s3 mb s3://${BUCKET} || exit 1
  aws s3api put-bucket-versioning --bucket ${BUCKET} --versioning-configuration Status=Enabled || exit 1
else
  echo "Using existing bucket: $BUCKET"
fi

echo "Create temp environment file"
envfile=/tmp/environment.json
cat > /tmp/environment.json << _EOF
{
  "StackName": "AQSG",
  "AmazonQAppId": "QAPPID",
  "AmazonQRegion": "QREGION",
  "AmazonQEndpoint": "QENDPOINT",
  "ContextDaysToLive": "QCONTEXTTTL",
  "OIDCIdPName": "QOIDCIDPNAME",
  "OIDCClientId": "QOIDCCLIENTID",
  "OIDCIssuerURL": "QOIDCISSUERURL",
  "GatewayIdCAppARN": "QGATEWAYIDCAPPARN"
}
_EOF

echo "Running npm install and build..."
npm install && npm run build

echo "Running cdk bootstrap..."
cdk bootstrap -c environment=$envfile

echo "Running cdk synthesize to create artifacts and template"
cdk synthesize --staging  -c environment=$envfile > /dev/null

echo "Converting and uploading Cfn artifacts to S3"
CDKTEMPLATE="AmazonQSlackGatewayStack.template.json"
echo node ./bin/convert-cfn-template.js $CDKTEMPLATE $BUCKET $PREFIX_AND_VERSION $REGION
node ./bin/convert-cfn-template.js $CDKTEMPLATE $BUCKET $PREFIX_AND_VERSION $REGION

MAIN_TEMPLATE="AmazonQSlackGateway.json"
aws s3 cp s3://${BUCKET}/${PREFIX_AND_VERSION}/${CDKTEMPLATE} s3://${BUCKET}/${PREFIX}/${MAIN_TEMPLATE} || exit 1

template="https://s3.${REGION}.amazonaws.com/${BUCKET}/${PREFIX}/${MAIN_TEMPLATE}"
echo "Validating converted template: $template"
aws cloudformation validate-template --template-url $template > /dev/null || exit 1

if $PUBLIC; then
  echo "Setting public read ACLs on published artifacts"
  files=$(aws s3api list-objects --bucket ${BUCKET} --prefix ${PREFIX_AND_VERSION} --query "(Contents)[].[Key]" --output text)
  for file in $files
    do
    aws s3api put-object-acl --acl public-read --bucket ${BUCKET} --key $file --region us-east-1
    done
  aws s3api put-object-acl --acl public-read --bucket ${BUCKET} --key ${PREFIX}/${MAIN_TEMPLATE} --region us-east-1
fi

echo "OUTPUTS"
echo Template URL: $template
echo CF Launch URL: https://${REGION}.console.aws.amazon.com/cloudformation/home?region=${REGION}#/stacks/create/review?templateURL=${template}\&stackName=AMAZON-Q-SLACK-GATEWAY
echo Done
exit 0

