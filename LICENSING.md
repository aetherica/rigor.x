# RIGOR-X Licensing Policy

**Policy version:** 1.0 · **Date:** 2026-11-25

## 1. Licensing position

RIGOR-X is proprietary, source-available commercial software. It is not Open Source Software and is not offered under a standard OSI-approved license. Public or private repository access does not itself grant a general software license for modification, redistribution, hosting, or commercial deployment. If hosted publicly on GitHub, the current GitHub Terms of Service separately grant platform-level rights to view and fork/reproduce content through GitHub functionality. Those platform rights are not an Open Source license or a commercial deployment grant. GitHub's current Terms also grant GitHub and its affiliates rights to use public content to develop, train, and improve AI/ML models and technologies. Review the [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) and the [public review guide](PUBLIC-REVIEW.md) before publication.

Commercial rights are granted through the **RIGOR-X Commercial Subscription License (CSL)**, the applicable modular addenda, and a mutually executed commercial Order Form. The standard framework is described in [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

## 2. Licensing architecture

The framework is deliberately modular:

1. **Repository notice — LICENSE:** identifies ownership and the absence of an open-source grant.
2. **Core contract — COMMERCIAL-LICENSE.md:** establishes definitions, base rights, ownership, restrictions, downstream principles, and version governance.
3. **Subscription schedule — SUBSCRIPTION-TERMS.md:** governs recurring commercial and usage charges.
4. **Deployment addenda:** add platform-provider or OEM/embedded rights only where expressly incorporated.
5. **Order Form:** identifies the customer, selected category, modules, versions, deployment environments, permitted use, capacity, term, price, usage rates, support, SLA, and negotiated exceptions.
6. **Amendments and changelog:** record mutually agreed changes and published document revisions.

An addendum does not grant rights unless incorporated into an executed Agreement or Order Form.

## 3. Extensible commercial categories

Categories are administrative and commercial profiles, not immutable license types. They may be added, revised, renamed, combined, retired, or replaced. A category name alone does not grant rights; the executed Order Form controls.

| Category identifier | Current profile | Typical scope (subject to Order Form) |
|---|---|---|
| CAT-DEV | Developer / Startup | Development, evaluation, and limited production deployment |
| CAT-ENT | Enterprise | Internal enterprise deployment and organization-wide use |
| CAT-PLATFORM | AI Platform / Service Provider | RIGOR-X-enabled customer-facing platform functionality |
| CAT-HOST | API / Model Host | Hosted inference, API, model-serving, or execution environments |
| CAT-MULTIMODAL | Multimodal Platform | Multimodal product and service integration |
| CAT-OEM | OEM / Embedded | Integration into commercial hardware or software products |
| CAT-WL | White-label | Authorized branded or unbranded customer-facing deployments |

Future categories may use new identifiers and schedules. The Licensor may maintain a category register outside the core contract, while each Order Form records the applicable category version and rights. No category is automatically included in another.

## 4. Commercial application process

1. **Submit an enquiry:** contact the rights holder through the official Aetherica channel at https://github.com/aetherica and request the current commercial licensing application route.
2. **Describe the deployment:** identify organization, product, intended users, jurisdictions, deployment topology, environment count, production instances, expected API/execution volume, integration type, and any downstream or redistribution requirements.
3. **Technical and commercial assessment:** the parties determine modules, capacity, security requirements, support, service levels, data-processing needs, and applicable addenda.
4. **Receive an Order Form:** the proposal specifies the negotiated category, deployment scope, monthly base subscription, usage-based fees, optional add-ons, term, billing currency, and special conditions.
5. **Execute and activate:** commercial rights begin only when the required Agreement and Order Form are signed and any stated activation conditions are met.

An application, quotation, evaluation discussion, or unsigned Order Form does not authorize commercial use.

## 5. Commercial model

The default commercial structure is:

**Monthly Base Subscription + Usage-Based Fees + Optional Add-ons**

Possible dimensions include licensed category, modules, deployment environments, production instances, API requests, execution units, throughput, integration scope, OEM/embedded distribution, white-label rights, dedicated deployment, enterprise support, and SLA. Pricing and included allowances are configurable and negotiated in the Order Form. This policy publishes no fixed prices.

## 6. Custom agreements

The parties may negotiate enterprise-specific Order Forms, custom categories, volume commitments, dedicated deployment schedules, data-processing terms, support schedules, security schedules, SLAs, OEM distribution rights, and other addenda. A negotiated signed document prevails over a general policy only to the extent its terms expressly differ and the Agreement's precedence clause permits.

## 7. Changes and grandfathering

The framework supports versioned documents, modular addenda, category revisions, new deployment types, new metering dimensions, and new billing models. Existing signed agreements remain governed by their incorporated versions unless changed through their own amendment or renewal mechanism. New agreements use the then-current version. Renewal agreements use the renewal terms expressly agreed. Material revisions are not retroactive merely because a new document is published. Grandfathered rights or prices continue only for the scope and period stated in the signed agreement.

See [LICENSING-CHANGELOG.md](LICENSING-CHANGELOG.md).

## 8. Frequently asked questions

### Is RIGOR-X Open Source?
No. It is proprietary, source-available software. No MIT, Apache, GPL, BSD, MPL, AGPL, or other standard open-source license is granted.

### Can a customer integrate RIGOR-X into its own AI product?
Yes, if the executed Order Form authorizes the integration and the applicable platform-provider or other addendum is incorporated.

### Can a customer offer RIGOR-X-enabled functionality to its own customers?
Yes, only where the category, addendum, and Order Form expressly authorize downstream service delivery. Downstream users do not thereby receive independent rights to RIGOR-X core software.

### Can a customer redistribute RIGOR-X inside a product?
Only where the applicable OEM/embedded addendum and Order Form expressly authorize the relevant distribution model and components.

### Are prices published here?
No. Prices, included usage, overages, and optional services are negotiated in the Order Form.

### Can the license change in the future?
Yes, through versioned documents and contractually valid amendments, renewals, or new agreements. New public versions do not silently rewrite existing signed agreements.

### Does repository visibility grant permission?
No. Repository visibility and possession of a source copy do not create a commercial license.

## 9. Third-party software

Third-party components retain their own licensing and terms. This policy does not relicense, replace, or override those rights. Review component-specific notices and dependency metadata before deployment.
