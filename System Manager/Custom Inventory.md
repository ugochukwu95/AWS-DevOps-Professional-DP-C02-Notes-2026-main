# Systems Manager Inventory and Custom Inventory

Inventory is a data-collection feature of AWS Systems Manager. It automatically gathers information about your managed nodes (EC2 instances, on-premises servers, VMs) and stores it centrally, so you can answer questions like:
- What applications are installed on my instances?
- What OS version and patch level is each node running?
- What network configurations, files, or Windows registry values exist on a node?
- Which instances have a specific package or version installed?

Without Inventory, you'd have to log into each machine individually to get this data. Inventory collects it automatically (on a schedule you define) and lets you query it centrally through Systems Manager, or export it to an S3 bucket and analyze it with Athena/QuickSight.

## How collection works
Inventory uses a State Manager association with the `AWS-GatherSoftwareInventory` document.
- Choose which inventory types to collect and a collection schedule.
- Target nodes by ID, tags, or resource groups.
- Inventory reports metadata; it does not install, remove, or modify software.
- Deleting the association stops future collection but does not immediately remove previously collected data.

## Built-in inventory types
Examples include:
- Applications and AWS components
- Instance details and operating-system configuration
- Network configuration
- Services and Windows roles
- Files
- Windows registry entries
- Windows updates

## Custom Inventory
Custom Inventory extends the built-in schema with organization-specific metadata that AWS does not collect natively—for example:
- Application owner and support team
- Business service or cost-center identifier
- Software license information
- Internal configuration or compliance attributes

Custom inventory data is submitted using `PutInventory`. A custom type name must use the `Custom:` prefix, such as `Custom:ApplicationMetadata`.

Conceptual example:
```json
{
  "TypeName": "Custom:ApplicationMetadata",
  "SchemaVersion": "1.0",
  "CaptureTime": "2026-08-23T12:00:00Z",
  "Content": [
    {
      "Application": "payments-api",
      "Owner": "platform-team",
      "Environment": "production"
    }
  ]
}
```

## Querying and aggregation
- Query inventory in the Systems Manager console or with `GetInventory`.
- Use **Resource Data Sync** to send inventory from multiple accounts and Regions to a central S3 bucket.
- Query synchronized data using Amazon Athena and visualize it with QuickSight.
- Resource Data Sync can also aggregate Explorer operational data.

## Inventory vs related features
| Requirement | Feature |
| --- | --- |
| Discover installed software and node metadata | Inventory |
| Determine operating-system patch compliance | Patch Manager |
| Enforce that software remains installed | State Manager |
| Install and version a reusable software package | Distributor |
| Query AWS resource configuration history | AWS Config |

**Exam tip**: Inventory provides visibility, not enforcement. Combine it with State Manager, Patch Manager, or Automation when findings require remediation.