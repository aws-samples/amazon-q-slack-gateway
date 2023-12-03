const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Read command line arguments
const templateName = process.argv[2];
const destinationBucket = process.argv[3];
const destinationPrefix = process.argv[4];
const awsRegion = process.argv[5];
if (!templateName || !destinationBucket || !destinationPrefix || !awsRegion) {
    console.error("Error: All arguments must be provided.");
    console.error("Usage: <script> <templateName> <destinationBucket> <destinationPrefix> <awsRegion>");
    process.exit(1);
}

const s3Client = new S3Client({ region: awsRegion });

// Run cdk synth first - it creates the Lambda code assets and CF template in cdk.out 
async function main() {

    try {
        // Read the CloudFormation template
        const templatePath = path.join('cdk.out', `${templateName}`);
        console.log(`Reading template from ${templatePath}...`);
        const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

        // Identify all Lambda function assets in the template
        console.log("Identifying Lambda function assets...");
        const assets = identifyLambdaAssets(template);

        // Zip and upload assets from cdk.out to new S3 location
        for (let asset of assets) {
            console.log(`Zipping and uploading asset: ${asset.key}`);
            const zippedFilePath = await zipAsset(asset);
            await uploadAsset(zippedFilePath, destinationBucket, destinationPrefix, asset.key);
            fs.unlinkSync(zippedFilePath); // Clean up local zipped file
        }

        // Update template with new asset paths
        console.log("Updating CloudFormation template with new asset paths...");
        updateTemplateLambdaAssetPaths(template, assets, destinationBucket, destinationPrefix);

        // Remove remaining CDK vestiges
        delete template.Parameters.BootstrapVersion;
        delete template.Rules.CheckBootstrapVersion;

        // Parameterize the environment variables
        console.log("Adding parameters to CloudFormation template...");
        parameterizeTemplate(template, assets);

        // Add slack app manifest to the Outputs
        console.log("Adding slack manifest to CloudFormation template...");
        addSlackAppManifestOutputToTemplate(template);

        // Modify template description to differentiate from cdk deployments
        template.Description += ' (from S3 template)'

        // Copy converted template to new S3 location
        const convertedTemplateKey = `${destinationPrefix}/${templateName}`;
        console.log(`Uploading converted template to s3://${destinationBucket}/${convertedTemplateKey}`);
        await s3Client.send(new PutObjectCommand({
            Bucket: destinationBucket,
            Key: convertedTemplateKey,
            Body: JSON.stringify(template, null, 2)
        }));

    } catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

function identifyLambdaAssets(template) {
    let assets = [];
    for (let [key, value] of Object.entries(template.Resources)) {
        if (value.Type === "AWS::Lambda::Function" && value.Properties.Code?.S3Key) {
            console.log(`Found asset in resource ${key}`);
            assets.push({
                key: value.Properties.Code.S3Key,
                resourceName: key
            });
        }
    }
    return assets;
}

async function zipAsset(asset) {
    const assetHash = asset.key.split('.')[0]
    const sourceDir = path.join('cdk.out', `asset.${assetHash}`);
    const outPath = `${path.join('cdk.out', assetHash)}.zip`;

    const zip = new JSZip();
    const files = fs.readdirSync(sourceDir);
    console.log(`Files: ${files}`)
    files.forEach(file => {
        const filePath = path.join(sourceDir, file);
        const fileData = fs.readFileSync(filePath);
        zip.file(file, fileData);
    });

    await new Promise((resolve, reject) => {
        zip
            .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
            .pipe(fs.createWriteStream(outPath))
            .on('finish', resolve) // Resolve the promise on finish
            .on('error', reject);  // Reject the promise on error
    });

    return outPath
}

async function uploadAsset(zippedFilePath, destinationBucket, destinationPrefix, originalKey) {
    const fileStream = fs.createReadStream(zippedFilePath);
    const destinationKey = `${destinationPrefix}/${path.basename(originalKey)}`;

    console.log(`Uploading zipped asset to s3://${destinationBucket}/${destinationKey}`);

    try {
        const response = await s3Client.send(new PutObjectCommand({
            Bucket: destinationBucket,
            Key: destinationKey,
            Body: fileStream
        }));
    } catch (error) {
        console.error("An error occurred:", error);
    }
}

function updateTemplateLambdaAssetPaths(template, assets, destinationBucket, destinationPrefix) {
    for (let asset of assets) {
        let lambdaResource = template.Resources[asset.resourceName];
        lambdaResource.Properties.Code.S3Bucket = destinationBucket;
        lambdaResource.Properties.Code.S3Key = `${destinationPrefix}/${path.basename(asset.key)}`;
    }
}

function parameterizeTemplate(template, assets) {
    template.Parameters = {
        AmazonQUserId: {
            Type: "String",
            Default: "",
            AllowedPattern: '(|^[\w.+-]+@([\w-]+\.)+[\w-]{2,6}$)',
            Description: '(Optional) Amazon Q User ID email address (leave empty to use Slack users email as user Id)'
        },
        AmazonQAppId: {
            Type: "String",
            AllowedPattern: '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$',
            Description: 'Existing Amazon Q Application ID (copy from Amazon Q console)'
        },
        AmazonQRegion: {
            Type: "String",
            Default: "us-east-1",
            AllowedValues: ['us-east-1', 'us-west-2'],
            Description: 'Amazon Q Region'
        },
        ContextDaysToLive: {
            Type: "Number",
            Default: 90,
            MinValue: 1,
            Description: 'Number of days to keep conversation context'
        }
    }
    for (let asset of assets) {
        let lambdaResource = template.Resources[asset.resourceName];
        lambdaResource.Properties.Environment.Variables.AMAZON_Q_ENDPOINT = ''; // use default endpoint
        lambdaResource.Properties.Environment.Variables.AMAZON_Q_USER_ID = { "Ref": "AmazonQUserId" };
        lambdaResource.Properties.Environment.Variables.AMAZON_Q_APP_ID = { "Ref": "AmazonQAppId" };
        lambdaResource.Properties.Environment.Variables.AMAZON_Q_REGION = { "Ref": "AmazonQRegion" };
        lambdaResource.Properties.Environment.Variables.CONTEXT_DAYS_TO_LIVE = { "Ref": "ContextDaysToLive" };
    }
}

function replaceSubstringInObject(obj, searchValue, replaceValue) {
    for (let key in obj) {
        if (typeof obj[key] === 'string') {
            obj[key] = obj[key].replace(searchValue, replaceValue);
        } else if (typeof obj[key] === 'object') {
            replaceSubstringInObject(obj[key], searchValue, replaceValue);
        }
    }
}

function findOutputKey(obj, substring) {
    let keys = Object.keys(obj).filter(key => key.includes(substring));
    return keys[0] || null; // Return the first key or null if no match is found
}

function addSlackAppManifestOutputToTemplate(template) {
    // Read the manifest template
    const manifestFile = 'slack-manifest-template.json';
    console.log(`Reading slack app manifest template from ${manifestFile}...`);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    // replace token string with variable
    replaceSubstringInObject(manifest, '!!! \[SlackBotName\] !!!', '${SlackBotName}');
    replaceSubstringInObject(manifest, '!!! \[SlackEventHandlerApiOutput\] !!!', '${SlackEventHandlerApiOutput}');
    replaceSubstringInObject(manifest, '!!! \[SlackInteractionHandlerApiOutput\] !!!', '${SlackInteractionHandlerApiOutput}');
    replaceSubstringInObject(manifest, '!!! \[SlackCommandApiOutput\] !!!', '${SlackCommandApiOutput}');
    manifestString = JSON.stringify(manifest);
    // get values for the token variables
    SlackBotNameValue = { "Ref": "AWS::StackName" }
    SlackEventHandlerApiOutputKey = findOutputKey(template.Outputs, 'SlackEventHandlerApiEndpoint');
    SlackEventHandlerApiOutputValue = template.Outputs[SlackEventHandlerApiOutputKey].Value;
    SlackInteractionHandlerApiOutputKey = findOutputKey(template.Outputs, 'SlackInteractionHandlerApiEndpoint');
    SlackInteractionHandlerApiOutputValue = template.Outputs[SlackInteractionHandlerApiOutputKey].Value;
    SlackCommandApiOutputKey = findOutputKey(template.Outputs, 'SlackCommandHandlerApiEndpoint');
    SlackCommandApiOutputOutputValue = template.Outputs[SlackCommandApiOutputKey].Value;
    // create manifest expression using Fn::Sub
    manifestExpression = {
        "Fn::Sub": [
            manifestString,
            {
                SlackBotName: SlackBotNameValue,
                SlackEventHandlerApiOutput: SlackEventHandlerApiOutputValue,
                SlackInteractionHandlerApiOutput: SlackInteractionHandlerApiOutputValue,
                SlackCommandApiOutput: SlackCommandApiOutputOutputValue
            }
        ]
    }
    // add manifest output to template
    template.Outputs.SlackAppManifest = {
        Value: manifestExpression,
        Description: 'Slack app manifest JSON (copy/paste to create/update slack app)'
    };
}

main();
