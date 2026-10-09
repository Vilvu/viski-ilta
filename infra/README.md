# WhiskyApp Azure Infrastructure (Bicep)

This directory contains the Infrastructure as Code (IaC) files for deploying the WhiskyApp Azure resources using Bicep.

## File Structure

```
infra/
├── main.bicep                    # Subscription-scoped entry point, creates RG + calls modules
├── modules/
│   ├── cosmosdb.bicep            # Cosmos DB account, DB, 4 containers
│   ├── storage.bicep             # Storage account + private whiskey-images container (bottle photos)
│   ├── signalr.bicep             # SignalR Service (Serverless, Free_F1) for real-time updates
│   └── staticwebapp.bicep        # SWA resource + app settings
├── parameters/
│   ├── dev.bicepparam
│   └── prod.bicepparam
└── README.md                     # Manual deploy instructions + secret setup guide

.github/workflows/infra-deploy.yml   # Manual-trigger workflow (workflow_dispatch)
```

## Prerequisites

1. Install [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. Install [Bicep CLI](https://docs.microsoft.com/en-us/azure/azure-resource-manager/bicep/install)
3. Login to Azure: `az login`

## First-time Deployment

1. Create a service principal for deployment:
   ```bash
   az ad sp create-for-rbac --name "whiskyapp-deploy" --role Contributor --scopes /subscriptions/{subscription-id}
   ```
   Save the output JSON - it will be used as the `AZURE_CREDENTIALS` GitHub secret.

2. Deploy the infrastructure (first pass — `cosmosKey` defaults to empty, which is fine since the Cosmos account doesn't exist yet):
   ```bash
   # For development environment
   az deployment sub create \
     --name "whiskyapp-infra-dev" \
     --location northeurope \
     --template-file infra/main.bicep \
     --parameters infra/parameters/dev.bicepparam
   
   # For production environment
   az deployment sub create \
     --name "whiskyapp-infra-prod" \
     --location northeurope \
     --template-file infra/main.bicep \
     --parameters infra/parameters/prod.bicepparam
   ```

3. Retrieve the Cosmos DB key after deployment:
   ```bash
   # For development environment
   az cosmosdb keys list \
     --name cosmos-whiskyapp-123-dev \
     --resource-group rg-whiskyapp-dev \
     --query primaryMasterKey \
     --output tsv
   
   # For production environment
   az cosmosdb keys list \
     --name cosmos-whiskyapp-prod \
     --resource-group rg-whiskyapp-prd \
     --query primaryMasterKey \
     --output tsv
   ```

   > **Important:** Re-deploy now with the real key so the SWA app settings are populated with `COSMOS_KEY`:
   > ```bash
   > # For development environment
   > COSMOS_KEY=$(az cosmosdb keys list --name cosmos-whiskyapp-123-dev --resource-group rg-whiskyapp-dev --query primaryMasterKey --output tsv)
   > az deployment sub create \
   >   --name "whiskyapp-infra-dev" \
   >   --location northeurope \
   >   --template-file infra/main.bicep \
   >   --parameters infra/parameters/dev.bicepparam \
   >   --parameters cosmosKey="$COSMOS_KEY"
   >
   > # For production environment
   > COSMOS_KEY=$(az cosmosdb keys list --name cosmos-whiskyapp-prod --resource-group rg-whiskyapp-prod --query primaryMasterKey --output tsv)
   > az deployment sub create \
   >   --name "whiskyapp-infra-prod" \
   >   --location northeurope \
   >   --template-file infra/main.bicep \
   >   --parameters infra/parameters/prod.bicepparam \
   >   --parameters cosmosKey="$COSMOS_KEY"
   > ```

4. Retrieve the SWA deployment token:
   ```bash
   # For development environment
   az staticwebapp secrets list \
     --name swa-whiskyapp-dev \
     --resource-group rg-whiskyapp-dev \
     --query properties.apiKey \
     --output tsv
   
   # For production environment
   az staticwebapp secrets list \
     --name swa-whiskyapp-prod \
     --resource-group rg-whiskyapp-prd \
     --query properties.apiKey \
     --output tsv
   ```

## Required GitHub Secrets

**Convention:** a secret that configures a deployment target is an **environment secret** with the same name in
`dev` and `prod`. Jobs select the environment with `environment:` (`infra-deploy.yml` uses
`environment: ${{ inputs.environment }}`). A secret used by shared tooling that deploys nowhere is a
**repository secret** with its own purpose-specific name, because jobs without `environment:` can't see
environment secrets.

Environment secrets (`dev` and `prod`):

- `AZURE_CREDENTIALS` - Service principal JSON from step 1
- `COSMOS_KEY` - Cosmos DB primary key (retrieved in step 3)
- `ANTHROPIC_API_KEY` - Optional. Anthropic API key that enables AI bottle recognition. When the secret is
  missing the app still works and the "Recognize with AI" button reports that it is not configured.

Repository secrets:

- `CLAUDE_REVIEW_API_KEY` - Anthropic API key for the Claude Code Review workflow (`claude-code-review.yml`) on PRs.
  Preferably a separate key, with a spend limit, from the app's `ANTHROPIC_API_KEY`. Without it the review
  check fails. Fork PRs never receive secrets.

The storage account for bottle photos needs no secret: `staticwebapp.bicep` reads its key and sets
`BLOB_STORAGE_CONNECTION_STRING` in the SWA app settings. The `storageAccountName` in each parameter file must be
globally unique (3–24 lowercase letters and digits).

The SignalR Service for real-time updates needs no secret either: `staticwebapp.bicep` reads its connection string
and sets `AzureSignalRConnectionString`. Azure allows only **one Free_F1 SignalR instance per subscription**, so
SignalR is deployed to **prod only**. `prod.bicepparam` sets `enableSignalR = true` and a globally unique
`signalrName`. In dev, `enableSignalR` defaults to `false`, so no SignalR resource is created, the app setting is
left out, and dev runs without real-time updates (the app falls back to normal fetching).

> **Note:** the SWA app settings resource replaces the whole settings set on every deploy. Always deploy with
> both `cosmosKey` and `anthropicApiKey` (the Infra Deploy workflow does this), or a manual deploy without
> `anthropicApiKey` will remove a previously configured `ANTHROPIC_API_KEY`.

## GitHub Environments Setup

The repository uses two GitHub Environments for dev/prod deployments:

### Create Environments

In the GitHub repository → **Settings → Environments**, create two environments:

| Environment | Protection rules | Secrets |
|-------------|------------------|---------|
| `dev` | None (auto-deploy on push to `dev` branch) | `AZURE_STATIC_WEB_APPS_API_TOKEN` = dev SWA token |
| `prod` | Optional: require reviewer approval | `AZURE_STATIC_WEB_APPS_API_TOKEN` = prod SWA token |

### Retrieve SWA Deployment Tokens

```bash
# Dev token
az staticwebapp secrets list --name swa-whiskyapp-dev --resource-group rg-whiskyapp-dev --query properties.apiKey --output tsv

# Prod token
az staticwebapp secrets list --name swa-whiskyapp-prod --resource-group rg-whiskyapp-prd --query properties.apiKey --output tsv
```

Add these tokens to the respective GitHub Environment secrets.

## Manual Configuration Steps

After infrastructure deployment, the following steps must be completed manually:

1. Configure Microsoft Entra ID identity provider on SWA (pre-configured provider - no additional setup needed for Free SKU)
2. Assign admin roles via Azure Portal

### Removing an existing SignalR instance from dev (one-time)

ARM deployments are incremental, so redeploying dev with `enableSignalR = false` does **not** delete a SignalR
instance that an earlier deployment created. Free up the Free_F1 slot by hand, **before** deploying prod:

1. **Redeploy dev infra:** run Actions → *Infra Deploy* → `dev`. Because the SWA app-settings resource replaces
   the whole set, this removes `AzureSignalRConnectionString` from dev. Dev then stops connecting to SignalR.
   (Deleting the instance first is harmless too, but dev would point at a dead endpoint until the next deploy.)
2. **Delete the dev instance:**
   ```bash
   az signalr delete --name signalr-whiskyapp-123-dev --resource-group rg-whiskyapp-dev
   ```
3. **Verify the subscription has no Free instance left:**
   ```bash
   az signalr list --query "[].{name:name, rg:resourceGroup, sku:sku.name}" -o table
   ```
4. **Deploy prod:** run *Infra Deploy* → `prod`, which creates `signalr-whiskyapp-123-prod` and sets its
   connection string on the prod SWA.

To try real-time in dev again later, set `param enableSignalR = true` and a `signalrName` in `dev.bicepparam`.
Only one environment can use Free_F1 at a time; the other needs `signalrSku = 'Standard_S1'`.

## Parameter Files

- `dev.bicepparam` - Parameters for the development environment
- `prod.bicepparam` - Parameters for the production environment

Both files use placeholders for the repository URL. The `cosmosKey` parameter defaults to empty and must be supplied via `--parameters cosmosKey=` on the second deployment pass once the Cosmos account exists.