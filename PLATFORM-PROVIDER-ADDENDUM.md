# RIGOR-X Platform Provider Addendum

**Addendum version:** 1.0 · **Date:** 2026-11-25

This addendum applies only when expressly incorporated into an executed Agreement and Order Form. It supplements the [RIGOR-X Commercial Subscription License](COMMERCIAL-LICENSE.md). If not incorporated, no platform-provider or downstream-service right is granted.

## 1. Eligible deployments

This addendum is designed for AI platforms, AI startups, model providers, API providers, API servers, cloud and hosting providers, multimodal platforms, hosted AI systems, and service providers that integrate RIGOR-X into a customer-facing or partner-facing service.

## 2. Express platform authorization

Subject to the Order Form, the Licensor authorizes the Licensee to:
- integrate and deploy the specified RIGOR-X components within the Licensee's platform, hosted service, API, model-serving stack, or multimodal system;
- operate those components in the approved cloud, on-premises, private-cloud, hybrid, or dedicated environments;
- expose RIGOR-X-enabled functionality, results, and service features to the Licensee's downstream customers and end users;
- provide support and service management for that functionality; and
- use approved adapters, interfaces, and integration components to connect RIGOR-X to third-party models, APIs, tools, and infrastructure.

The Order Form must identify whether the deployment is single-tenant, multi-tenant, dedicated, shared, managed, or customer-hosted, and must specify permitted customer populations, production instances, usage metrics, regions, and modules.

## 3. Downstream access boundary

Downstream users may access the Licensee's service functionality under the Licensee's own customer terms. Such access does not grant downstream users ownership, possession rights, or an independent license to RIGOR-X source code, core software, proprietary architecture, or Licensor Materials.

The Licensee must not expose source repositories, administrative interfaces, internal control planes, or extraction mechanisms to downstream users unless the Order Form expressly authorizes a specific technical access model. The Licensee must contractually prohibit downstream extraction, reverse distribution, unauthorized copying, and use outside the service.

## 4. Licensee responsibilities

The Licensee is responsible for:
- downstream customer terms, acceptable-use controls, and access management;
- security of credentials, tenants, integrations, and deployment environments under its control;
- obtaining rights for third-party models, APIs, data, and cloud services;
- monitoring usage against contractual limits;
- providing first-line downstream support unless otherwise agreed;
- ensuring its downstream marketing does not misrepresent ownership or licensing of RIGOR-X; and
- promptly notifying the Licensor of material security incidents involving Licensor Materials.

## 5. Data and model training

Customer Data remains subject to the Agreement and any data-processing terms. This addendum does not authorize the Licensor or Licensee to use the other party's Confidential Information or non-public source materials for AI training absent express written authorization. Each party must independently establish lawful rights and notices for any model, dataset, or downstream processing it controls.

## 6. Metering, capacity, and service levels

The Order Form must define any API request, execution, throughput, tenant, active-instance, storage, or other usage metric; included allowance; overage; hard cap; rate; and measurement source. Support, uptime, response, recovery, maintenance, and service-credit commitments apply only if expressly stated in an SLA or Order Form.

## 7. No implied redistribution

This addendum authorizes delivery of RIGOR-X-enabled functionality as a service. It does not, by itself, authorize distribution of RIGOR-X binaries, source code, SDKs, containers, installers, or other copies to downstream customers. Any such distribution requires express separate authorization in the Order Form and, where appropriate, the [OEM/Embedded Addendum](OEM-EMBEDDED-ADDENDUM.md).

## 8. Termination

On expiry or termination, the Licensee must cease the platform deployment and downstream service use within the agreed wind-down period, disable affected functionality, and comply with data export and deletion terms. The Licensee must not continue service delivery by relying on retained copies after the license ends.
