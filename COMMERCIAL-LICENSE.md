# RIGOR-X Commercial Subscription License (CSL)

**Document version:** 1.0  
**Effective publication date:** 2026-11-25  
**Classification:** Proprietary · Source-Available · Not Open Source

This document is the standard contractual framework for commercial subscriptions to RIGOR-X. It is intended to be incorporated into an agreement signed by the applicable rights holder (the **Licensor**) and the customer identified in an executed Order Form (the **Licensee**). It is not, by itself, an offer capable of acceptance. No license is granted until the parties execute an agreement or Order Form that expressly incorporates this document.

**Public GitHub hosting notice:** If RIGOR-X is hosted in a public GitHub repository, the applicable GitHub Terms of Service separately govern platform access. Those terms permit other GitHub users to view and fork public content through GitHub functionality and grant GitHub and its affiliates rights to use public content to develop, train, and improve AI/ML models and technologies. This CSL does not purport to cancel those platform rights. They are not a general Open Source or commercial deployment license. See the [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).

> **Core principle:** The Licensor does not sell ownership of RIGOR-X. The Licensor grants a scoped contractual right to commercially deploy, integrate, operate, and derive business value from authorized RIGOR-X capabilities for the applicable subscription term.

## 1. Definitions

- **Agreement** means the executed subscription agreement, this CSL version as incorporated, the applicable Order Form, and any expressly incorporated addenda.
- **Authorized Affiliate** means an entity controlled by, controlling, or under common control with the Licensee, but only where the Order Form expressly includes it.
- **Authorized Environment** means a production, staging, test, development, cloud, on-premises, private-cloud, or other environment expressly listed in the Order Form.
- **Authorized Purpose** means the internal or external business purpose, workload, product, service, and deployment scope expressly authorized in the Order Form.
- **Customer Data** means data, prompts, files, records, and other materials submitted to or processed through RIGOR-X by or for the Licensee, excluding RIGOR-X and Licensor Materials.
- **Customer Outputs** means output generated for the Licensee through authorized use, excluding RIGOR-X, its components, and any Licensor Materials embedded in or accompanying an output.
- **Documentation** means user, technical, integration, and operational documentation supplied by the Licensor.
- **Licensor Materials** means RIGOR-X, its source and object code, architecture, implementation, modules, components, schemas, interfaces, documentation, configurations, non-public technical materials, updates, and related intellectual property supplied or made available by the Licensor.
- **RIGOR-X** means the software product and the specific modules, versions, interfaces, and deliverables identified in the Order Form.
- **Subscription Term** means the subscription period stated in the Order Form and governed by the Subscription Terms.
- **Third-Party Components** means software, models, datasets, APIs, and services not owned by the Licensor.

## 2. Grant of rights

Subject to payment, compliance with the Agreement, and the limits in the Order Form, the Licensor grants the Licensee a limited, non-exclusive, non-transferable (except as expressly permitted), non-sublicensable license during the Subscription Term to:

1. install, access, reproduce, configure, execute, and operate the licensed RIGOR-X components in the Authorized Environments;
2. use those components for the Authorized Purpose and within the contracted capacity and usage limits;
3. integrate RIGOR-X with the Licensee's products, services, models, APIs, systems, and workflows to the extent stated in the Order Form; and
4. permit its authorized personnel and contractors to exercise these rights solely on the Licensee's behalf, subject to written confidentiality and use restrictions at least as protective as the Agreement.

The grant does not transfer ownership. Rights for platform-provider, API/model-host, multimodal, OEM, embedded, redistribution, or white-label use require the applicable addendum and express Order Form authorization.

## 3. Ownership and intellectual property

As between the parties, the Licensor or its licensors retain all right, title, and interest in Licensor Materials, including all associated intellectual property rights. The Licensee retains ownership of Customer Data and, as between the parties, Customer Outputs, subject to third-party rights and the exclusions in this Agreement.

No ownership interest in RIGOR-X is transferred. No implied license is granted. Feedback may be used by the Licensor to improve its products without restriction, provided that the Licensor does not disclose the Licensee's Confidential Information or Customer Data in doing so.

This Agreement does not claim exclusive ownership over abstract ideas, mathematical principles, algorithms as such, methods, or concepts to the extent they are not protectable under applicable law. Protection applies to rights that subsist in particular code, expression, documentation, designs, confidential information, trade secrets, marks, and other protectable subject matter.

## 4. Authorized use and deployment scope

The Licensee may use RIGOR-X only:
- for the Authorized Purpose;
- in the Authorized Environments;
- through the licensed modules and versions;
- within instance, user, throughput, execution, API, and other limits in the Order Form; and
- for the license category and deployment model identified in the Order Form.

The Order Form may authorize internal business use, customer-facing services, hosted platform functionality, model/API hosting, multimodal services, OEM/embedded distribution, or white-label deployments. An authorization for one deployment type does not imply authorization for another.

## 5. Commercial use and integration

Commercial use is permitted only within the rights expressly granted by the Agreement. Standard subscription rights may include internal commercial operation and integration into the Licensee's own systems. Providing RIGOR-X-enabled functionality to external customers, operating a shared or multi-tenant service, hosting RIGOR-X for third parties, embedding it in a distributed product, or redistributing integration packages requires the relevant category and addendum.

Integration does not make RIGOR-X a work-for-hire or transfer its ownership. The Licensee may develop and own its independent integration code, adapters, user interfaces, and workflows, provided they do not reproduce or disclose Licensor Materials beyond the authorized scope.

## 6. Restrictions

Except to the extent a restriction is prohibited by mandatory applicable law, or expressly permitted in writing, the Licensee must not:

1. sell, rent, lease, lend, publish, distribute, sublicense, or make Licensor Materials available as a standalone product or source repository;
2. provide third parties with direct access to RIGOR-X source code or core software except as expressly authorized;
3. remove or obscure proprietary notices, ownership notices, or security controls;
4. use Licensor Materials to build or facilitate an unauthorized competing reproduction of the proprietary implementation;
5. extract, copy, or disclose non-public source, architecture, configurations, documentation, or trade secrets beyond the licensed scope;
6. use non-public source code or Confidential Information to train, fine-tune, evaluate, or develop an AI model or dataset, except with the Licensor's prior written authorization;
7. circumvent technical access controls, license metering, or usage limits;
8. use RIGOR-X unlawfully, to infringe third-party rights, or in a manner that violates applicable export, sanctions, privacy, or security obligations; or
9. claim that the Licensee owns RIGOR-X or is authorized beyond the Order Form.

Nothing in this section prohibits lawful interoperability, reverse engineering or decompilation rights that cannot validly be excluded under applicable law, security research authorized by law, or other mandatory user rights. The parties will interpret and apply restrictions narrowly to preserve those rights.

## 7. Subscription and fees

Subscription periods, monthly billing, renewal, cancellation, payment, taxes, usage-based charges, overages, suspension, grace periods, expiration, data export, and post-termination treatment are governed by [SUBSCRIPTION-TERMS.md](SUBSCRIPTION-TERMS.md) as incorporated into the Agreement.

Fees are not fixed by this document. The Order Form specifies the monthly base subscription, included usage, metering dimensions, usage rates, optional add-ons, billing currency, payment method, and any negotiated discounts or minimum commitments. No price or usage allowance is implied where the Order Form is silent.

## 8. Downstream users

Where the Order Form authorizes downstream service delivery, the Licensee may expose RIGOR-X-enabled functionality to its customers and end users through the Licensee's own product or service. The Licensee must ensure downstream terms protect Licensor Materials and do not purport to grant ownership or an independent license to RIGOR-X.

Downstream users receive only the rights necessary to access the Licensee's service. They do not automatically receive rights to install, copy, modify, extract, redistribute, or independently operate RIGOR-X. The Licensee remains responsible for downstream acts and omissions within its control.

## 9. Customer Data, outputs, and modifications

The Licensee retains its rights in Customer Data. As between the parties, the Licensee owns Customer Outputs, subject to third-party rights, applicable law, and the fact that outputs do not transfer ownership of Licensor Materials.

The Licensee may create configuration changes, adapters, and modifications only within the scope authorized by the Order Form. Unless otherwise agreed, modifications to Licensor Materials and all rights in them remain with the Licensor, subject to the Licensee's rights in its independently created materials. The parties may agree in an Order Form or amendment on ownership, assignment, or licensing of specifically commissioned work.

The Licensor will process Customer Data only as described in the Agreement and any applicable data-processing terms. No general right to use Customer Data for model training is granted by this CSL.

## 10. Confidentiality and security

Each party must protect the other party's Confidential Information using at least reasonable care and no less than the care it uses for its own similar information. Confidential Information may be used only to perform or exercise rights under the Agreement and may be disclosed only to personnel, professional advisers, and contractors who need to know it and are bound by confidentiality obligations.

Confidentiality does not apply to information the receiving party can demonstrate is public without breach, already lawfully known, independently developed without use of the information, or lawfully received from a third party without confidentiality duty. A party may disclose information where legally compelled, subject to lawful notice and cooperation.

The Licensee must maintain reasonable administrative, technical, and organizational safeguards for Licensor Materials and credentials. Security incident notification, audit rights, data processing, retention, and security schedules may be specified in the Order Form or a separate addendum.

## 11. Third-party components

Third-Party Components are governed by their own license agreements, terms, and notices. The Licensor does not grant rights beyond those it is authorized to grant. Where a third-party license conflicts with this CSL for that component, the third-party license controls to the extent of the conflict. The Licensee is responsible for obtaining any independent rights required for its selected models, APIs, datasets, or services unless the Order Form expressly states otherwise.

## 12. Warranties and disclaimers

Any warranties, service levels, support commitments, availability targets, remedies, and liability limits must be stated in the executed Agreement or Order Form. Except for express commitments in those documents, RIGOR-X is provided on an "as available" and development-status basis to the maximum extent permitted by applicable law. Nothing excludes warranties or rights that cannot legally be excluded.

## 13. Termination and effect

Termination, suspension for non-payment or material breach, cure periods, and post-termination obligations are governed by the Agreement and Subscription Terms. On expiry or termination, the Licensee must cease the uses no longer authorized, disable access, and return or securely delete Licensor Materials and Confidential Information as required by the Agreement, subject to lawful archival copies and mandatory retention.

Any continued use, transition assistance, data export window, or wind-down service must be stated in the Order Form or Subscription Terms. Accrued payment obligations, ownership, confidentiality, restrictions, disclaimers, liability provisions, dispute provisions, and terms intended by their nature to survive will survive.

## 14. License evolution, precedence, and versioning

This CSL is versioned. The version incorporated into a signed Agreement governs that Agreement unless amended in writing. The Licensor may publish new versions, addenda, categories, deployment schedules, or billing models for future agreements.

A later publication does not automatically amend an existing signed Agreement. Changes to an existing Agreement require the amendment, renewal, notice, or change mechanism expressly provided in that Agreement and applicable law. Renewal terms apply only as stated in the renewal provisions or a mutually executed renewal Order Form. Any grandfathered price, scope, or right remains effective for the period and conditions expressly stated in the applicable Order Form.

If documents conflict, the following order applies unless the signed Agreement expressly states otherwise: (1) negotiated amendment; (2) Order Form for its specific commercial scope; (3) applicable signed addendum; (4) the CSL version incorporated; (5) Subscription Terms; (6) other referenced policy documents. A later unsigned web publication does not override an executed contract.

## 15. General

The Agreement should specify governing law, forum or dispute resolution, notices, assignment, force majeure, severability, entire agreement, and signature mechanics. No jurisdiction is selected by this template. Mandatory laws and non-waivable rights continue to apply.

## 16. Related documents

- [LICENSE](LICENSE) — repository notice.
- [LICENSING.md](LICENSING.md) — policy, categories, and application route.
- [SUBSCRIPTION-TERMS.md](SUBSCRIPTION-TERMS.md) — recurring billing and subscription operations.
- [PLATFORM-PROVIDER-ADDENDUM.md](PLATFORM-PROVIDER-ADDENDUM.md) — hosted and downstream platform rights.
- [OEM-EMBEDDED-ADDENDUM.md](OEM-EMBEDDED-ADDENDUM.md) — OEM, embedded, distribution, and white-label rights.
- [LICENSING-CHANGELOG.md](LICENSING-CHANGELOG.md) — document revision history.
