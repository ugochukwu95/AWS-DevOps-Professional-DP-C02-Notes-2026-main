# AWS DevOps Engineer – Professional (DOP-C02) Notes

Personal study notes for the [AWS Certified DevOps Engineer – Professional (DOP-C02)](https://aws.amazon.com/certification/certified-devops-engineer-professional/) exam.

Each service folder has short markdown notes: what the service is, how it is used in DevOps workflows, and exam-style scenarios.

## Topics

| Area | Folder |
| --- | --- |
| CI/CD | [CodePipeline](CodePipeline), [CodeBuild](Codebuild), [CodeDeploy](CodeDeploy), [CodeArtifact](AWS%20CodeArtifact), [CodeGuru](CodeGuru) |
| Infrastructure as code | [CloudFormation](AWS%20Cloudformation), [SAM and Lambda](AWS%20SAM%20and%20Lambda), [Terraform](Terraform) |
| Compute and containers | [Elastic Beanstalk](AWS%20Elastic%20Beanstalk), [ECS](AWS%20ECS), [EKS](AWS%20EKS), [ECR](ECR), [EC2 Image Builder](AWS%20EC2%20Image%20Builder) |
| Orchestration | [Step Functions](Step%20Functions) |
| Messaging and events | [SNS](AWS%20SNS), [SQS](AWS%20SQS), [EventBridge](AWS%20EventBridge), [Kinesis](AWS%20kinesis) |
| API management | [API Gateway](API%20Gateway) |
| Observability and governance | [CloudWatch](Amazon%20CloudWatch), [Config](AWS%20Config), [Security Hub](AWS%20Security%20Hub), [Systems Manager](System%20Manager) |
| Identity and encryption | [IAM](AWS%20IAM), [KMS](AWS%20KMS) |
| Multi-account | [Organizations](AWS%20Organizations), [Control Tower](AWS%20Control%20Tower) |
| Network security | [WAF, Firewall Manager, and Shield](AWS%20WAF,%20AWS%20Firewall%20Manager,%20AWS%20Shield%20Advanced,%20and%20AWS%20Shield%20network%20security%20director) |
| Data | [Aurora](Amazon%20Aurora), [ElastiCache](Amazon%20ElastiCache) |
| Architecture | [Well-Architected Framework](AWS%20Well-Architected%20Six%20Pillars) |
| Scaling (cross-service) | [AWS Scaling](AWS%20Scaling) |
| Incident & event response | [Incident Response](Incident%20Response) |
| Infrastructure automation | [Infrastructure Automation](Infrastructure%20Automation) |

## Solutions Architect – Professional (SAP-C03) additions

Notes for the [AWS Certified Solutions Architect – Professional (SAP-C03)](https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-professional-03/solutions-architect-professional-03.html) exam, which replaced SAP-C02 on November 17, 2026. They cover topics the DOP-C02 notes leave out. Many DOP-C02 folders above also apply, especially for Domains 2 and 5.

| Area | Folder |
| --- | --- |
| Bedrock, AgentCore, RAG, SageMaker AI inference, guardrails, AI cost | [AI and ML Architecture](AI%20and%20ML%20Architecture) |
| Event-driven and durable workflows, containers and service mesh, multi-tenant SaaS, resilience patterns | [Cloud-Native Application Patterns](Cloud-Native%20Application%20Patterns) |
| Application and workload identity, data perimeters, encryption in transit, compliance and data residency | [Security, Identity, and Compliance](Security,%20Identity,%20and%20Compliance) |
| Hybrid and multi-VPC networking, hybrid DNS, IPv6, directory services | [Hybrid Networking](Hybrid%20Networking) |
| Migration strategies, AWS Transform, MGN, DMS, data transfer, modernization | [Migration and Modernization](Migration%20and%20Modernization) |
| DR strategies, Elastic Disaster Recovery, AWS Backup, Resilience Hub, multi-Region replication | [Disaster Recovery](Disaster%20Recovery) |
| S3, EBS, EFS, FSx | [Amazon S3 and Storage](Amazon%20S3%20and%20Storage) |
| Database selection, DynamoDB, data lakes, lakehouse, streaming | [Databases and Analytics](Databases%20and%20Analytics) |
| Purchase options, cost allocation, data transfer pricing, observability cost | [Cost Optimization](Cost%20Optimization) |
| CloudFront, Global Accelerator, load balancing, hybrid compute, Outposts, Local Zones | [Edge and Performance](Edge%20and%20Performance) |

### SAP-C03 domain map

| Domain (weight) | SAP-C03 folders | Relevant DOP-C02 folders |
| --- | --- | --- |
| 1. Architecture Design and Implementation Built for the Cloud (25%) | AI and ML Architecture, Cloud-Native Application Patterns, Hybrid Networking, Edge and Performance, Databases and Analytics, Amazon S3 and Storage | SQS, SNS, EventBridge, Kinesis, Step Functions, API Gateway, ECS, EKS, ECR, SAM and Lambda, ElastiCache, Aurora |
| 2. Security, Compliance, and Governance (25%) | Security, Identity, and Compliance, AI and ML Architecture, Hybrid Networking | IAM, KMS, Organizations, Control Tower, Config, Security Hub, WAF and Shield, Systems Manager |
| 3. Cost-Optimized Architecture Design (15%) | Cost Optimization, AI and ML Architecture, Edge and Performance | AWS Scaling |
| 4. Resilience, Migration, and Business Continuity (15%) | Migration and Modernization, Disaster Recovery | Incident Response |
| 5. Operational Excellence and Automation (20%) | Cloud-Native Application Patterns, AI and ML Architecture | CloudFormation, CodePipeline, CodeBuild, CodeDeploy, CloudWatch, Systems Manager, Infrastructure Automation, Incident Response |

## Other

[Andela](Andela) holds separate assessment-prep notes and small Node.js samples. It is not part of the DOP-C02 notes.

[Mercor](Mercor) holds software-engineering interview prep for Mercor’s loop (spoken screen, coding drills, job-scheduler design). It is not part of the DOP-C02 notes.

[Kubernetes](Kubernetes) is a separate 16-week hands-on learning path, from a local kind cluster to EKS operations and failure drills, built around one small project (a Go API, a Go worker and PostgreSQL in [Kubernetes/taskq](Kubernetes/taskq)). It is not part of the DOP-C02 notes, but it complements the [EKS](AWS%20EKS) and [Terraform](Terraform) folders.

[Live Tracking](Live%20Tracking) is a practical note on ride-hailing style location systems (MQTT, edge gateways, H3, Redis, Kafka/Kinesis). It is not part of the DOP-C02 notes.

## Disclaimer

These notes are unofficial study material. They are not affiliated with or endorsed by Amazon Web Services. Service behavior and exam content change; confirm details against current AWS documentation.
