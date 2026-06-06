# WhiskyApp Azure Infrastructure (Bicep)

This directory contains the Infrastructure as Code (IaC) files for deploying the WhiskyApp Azure resources using Bicep.

## File Structure

```
infra/
├── main.bicep                    # Subscription-scoped entry point, creates RG + calls modules
├── modules/
│   ├── cosmosdb.bicep            # Cosmos DB account, DB, 3 containers
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
   > COSMOS_KEY=$(az cosmosdb keys list --name cosmos-whiskyapp-123-dev --resource-group rg-whiskyapp --query primaryMasterKey --output tsv)
   > az deployment sub create \
   >   --name "whiskyapp-infra-dev" \
   >   --location northeurope \
   >   --template-file infra/main.bicep \
   >   --parameters infra/parameters/dev.bicepparam \
   >   --parameters cosmosKey="$COSMOS_KEY"
   >
   > # For production environment
   > COSMOS_KEY=$(az cosmosdb keys list --name cosmos-whiskyapp-prod --resource-group rg-whiskyapp --query primaryMasterKey --output tsv)
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

- `AZURE_CREDENTIALS` - Service principal JSON from step 1
- `COSMOS_KEY` - Cosmos DB primary key (retrieved in step 3)

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

1. Configure Google OAuth identity provider on SWA (via Azure Portal)
2. Assign admin roles via Azure Portal

## Parameter Files

- `dev.bicepparam` - Parameters for the development environment
- `prod.bicepparam` - Parameters for the production environment

Both files use placeholders for the repository URL. The `cosmosKey` parameter defaults to empty and must be supplied via `--parameters cosmosKey=` on the second deployment pass once the Cosmos account exists.