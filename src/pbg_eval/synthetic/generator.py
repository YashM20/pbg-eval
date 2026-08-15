"""Programmatic synthetic PBG document generator with deterministic injected anomalies."""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass
from typing import Any

STANDARD_MASTER_PBG = """PERFORMANCE BANK GUARANTEE FORMAT
(To be executed on non-judicial stamp paper of appropriate value)

In consideration of the Indian Oil Corporation Ltd. (hereinafter called "the Corporation") having awarded to M/s. [SUPPLIER_NAME] having its registered office at [SUPPLIER_ADDRESS] (hereinafter called "the Supplier") a Contract for [WORK_ORDER_DESCRIPTION] on the terms and conditions contained in LOA / PO No. [PO_NUMBER] dated [PO_DATE], the Bank hereby agrees as follows:

We, [BANK_NAME], a body corporate constituted under the Banking Companies Act and having one of its branch office at [BRANCH_ADDRESS] (hereinafter called "the Bank") with the intent to bind the Bank, hereby undertake to pay the Corporation on first demand in writing without protest or demur any and all amounts payable by the Supplier upto a sum of Rs. [AMOUNT] (Rupees [AMOUNT_WORDS]) only.

1. The Bank doth hereby undertake to pay the Corporation on first demand at New Delhi without protest or demur and without reference to the Supplier, any and all amounts from time to time demanded by the Corporation with reference to the said Contract now or at any time anywhere have in relation to the Supplier's obligations.

2. The Corporation shall have the fullest liberty without our consent and without affecting in any manner our obligations hereunder to vary any of the terms and conditions of the said Contract or to extend time of performance by the said Supplier from time to time.

3. The Bank shall not be released from its liability under these presents by any exercise by the Corporation of the liberty with reference to the matters aforesaid or by reason of time being given to the Supplier or any other forbearance, act or omission on the part of the Corporation.

4. The Guarantee / Undertaking herein contained shall be a continuing guarantee and shall not be anywise affected by any change in the constitution of the Supplier or the Bank or by any merger, amalgamation or absorption thereof.

5. Notwithstanding anything to the contrary contained herein above:
   a) The liability of the Bank under this Guarantee shall be limited to an aggregate sum of Rs. [AMOUNT] (Rupees [AMOUNT_WORDS]) only.
   b) This Guarantee shall remain in force upto [EXPIRY_DATE] and any claim under this Guarantee must be received by the Bank on or before [CLAIM_DATE].
   c) Unless a demand or claim under this Guarantee is made on the Bank in writing on or before [CLAIM_DATE], the Bank shall be discharged from all liabilities under this Guarantee thereafter.

6. This Guarantee / Undertaking shall be governed by and construed in accordance with the laws of India and shall be subject to the exclusive jurisdiction of the Courts at New Delhi.

7. The invocation of this Guarantee can be made by Corporation through a demand notice signed by an authorized officer of the Corporation delivered at the Bank's branch.

8. The undersigned [NAME_AND_DESIGNATION] is authorised to sign this Guarantee / Undertaking on behalf of the Bank.

Yours faithfully,
For [BANK_NAME]
Authorized Signatory"""


@dataclass
class InjectedAnomaly:
    id: str
    name: str
    clause_no: str
    appearing_in_bg: str
    should_be_corrected_as: str
    severity: str
    reason: str


@dataclass
class SyntheticDocument:
    doc_id: str
    title: str
    description: str
    vendor_text: str
    master_text: str
    injected_anomalies: list[dict[str, Any]]


def generate_synthetic_suite() -> list[SyntheticDocument]:
    """Generate a suite of synthetic PBG edge-case test documents with verified ground-truth."""
    suite: list[SyntheticDocument] = []

    # 1. Dropped Negation in Clause 4 (CRITICAL)
    vendor_text_1 = STANDARD_MASTER_PBG.replace(
        "[SUPPLIER_NAME]", "Sterling Auxiliaries Pvt Ltd"
    ).replace(
        "[SUPPLIER_ADDRESS]", "Plot 42, MIDC, Mahad, Maharashtra"
    ).replace(
        "[WORK_ORDER_DESCRIPTION]", "Supply of Specialty Catalysts"
    ).replace(
        "[PO_NUMBER]", "PO/2026/IOCL/8821"
    ).replace(
        "[PO_DATE]", "15-JAN-2026"
    ).replace(
        "[BANK_NAME]", "HDFC Bank Ltd"
    ).replace(
        "[BRANCH_ADDRESS]", "Barakhamba Road, Connaught Place, New Delhi 110001"
    ).replace(
        "[AMOUNT]", "50,00,000/-"
    ).replace(
        "[AMOUNT_WORDS]", "Fifty Lakhs Only"
    ).replace(
        "[EXPIRY_DATE]", "31-DEC-2028"
    ).replace(
        "[CLAIM_DATE]", "31-MAR-2029"
    ).replace(
        "[NAME_AND_DESIGNATION]", "Rahul Sharma, Senior Manager (Sign Code: 4410)"
    ).replace(
        "shall not be anywise affected", "shall be anywise affected"  # ANOMALY: Negation dropped
    )

    suite.append(
        SyntheticDocument(
            doc_id="syn-dropped-negation-cl4",
            title="Dropped Negation in Clause 4",
            description="Clause 4 omits the vital word 'not', reversing the bank's continuing liability upon constitution changes.",
            vendor_text=vendor_text_1,
            master_text=STANDARD_MASTER_PBG,
            injected_anomalies=[
                asdict(
                    InjectedAnomaly(
                        id="anom-01",
                        name="Dropped Negation",
                        clause_no="Clause 4",
                        appearing_in_bg="shall be anywise affected",
                        should_be_corrected_as="shall not be anywise affected",
                        severity="CRITICAL",
                        reason="Removes the negative condition, thereby terminating bank liability upon constitutional change.",
                    )
                )
            ],
        )
    )

    # 2. Conflicting Payment Branch in Footer (CRITICAL)
    vendor_text_2 = STANDARD_MASTER_PBG.replace(
        "[SUPPLIER_NAME]", "Delton Cables Limited"
    ).replace(
        "[SUPPLIER_ADDRESS]", "Delton House, Bharat Nagar, New Delhi"
    ).replace(
        "[WORK_ORDER_DESCRIPTION]", "Instrumentation Cabling Works"
    ).replace(
        "[PO_NUMBER]", "PO/2026/IOCL/9932"
    ).replace(
        "[PO_DATE]", "20-FEB-2026"
    ).replace(
        "[BANK_NAME]", "ICICI Bank Ltd"
    ).replace(
        "[BRANCH_ADDRESS]", "9A Phelps Building, Connaught Place, New Delhi"
    ).replace(
        "[AMOUNT]", "1,25,00,000/-"
    ).replace(
        "[AMOUNT_WORDS]", "One Crore Twenty Five Lakhs Only"
    ).replace(
        "[EXPIRY_DATE]", "30-JUN-2028"
    ).replace(
        "[CLAIM_DATE]", "30-SEP-2028"
    ).replace(
        "[NAME_AND_DESIGNATION]", "Amit Patel, Chief Manager"
    ) + "\n\nNotwithstanding anything contained above, all claims under this guarantee will be payable at our Mumbai Nariman Point Branch only."

    suite.append(
        SyntheticDocument(
            doc_id="syn-payment-conflict-footer",
            title="Conflicting Payment Location in Footer",
            description="Appends a post-Clause 8 sentence redirecting payment strictly to Mumbai contrary to Master New Delhi obligation.",
            vendor_text=vendor_text_2,
            master_text=STANDARD_MASTER_PBG,
            injected_anomalies=[
                asdict(
                    InjectedAnomaly(
                        id="anom-02",
                        name="Payment Location Redirection",
                        clause_no="Signatory Block / Post-Clause 8",
                        appearing_in_bg="all claims under this guarantee will be payable at our Mumbai Nariman Point Branch only.",
                        should_be_corrected_as="The above content should be removed, as it is not part of the approved PBG format.",
                        severity="CRITICAL",
                        reason="Restricts and redirects payment to Mumbai contrary to the standard New Delhi payment undertaking.",
                    )
                )
            ],
        )
    )

    # 3. Jurisdiction Alteration (CRITICAL) & Instruction Leak (MINOR)
    vendor_text_3 = STANDARD_MASTER_PBG.replace(
        "[SUPPLIER_NAME]", "Star Engineers Ltd"
    ).replace(
        "[SUPPLIER_ADDRESS]", "Chakan Industrial Area, Pune"
    ).replace(
        "[WORK_ORDER_DESCRIPTION]", "Switchgear Equipment Fabrication"
    ).replace(
        "[PO_NUMBER]", "PO/2026/IOCL/1102"
    ).replace(
        "[PO_DATE]", "10-MAR-2026"
    ).replace(
        "[BANK_NAME]", "State Bank of India"
    ).replace(
        "[BRANCH_ADDRESS]", "CAG Branch, Parliament Street, New Delhi"
    ).replace(
        "[AMOUNT]", "75,00,000/-"
    ).replace(
        "[AMOUNT_WORDS]", "Seventy Five Lakhs Only"
    ).replace(
        "[EXPIRY_DATE]", "31-DEC-2027 (here put the entire period required for performance plus 3 months)"
    ).replace(
        "[CLAIM_DATE]", "31-MAR-2028"
    ).replace(
        "[NAME_AND_DESIGNATION]", "Suresh Menon, Assistant General Manager"
    ).replace(
        "exclusive jurisdiction of the Courts at New Delhi", "jurisdiction of the Courts at Kolkata"
    )

    suite.append(
        SyntheticDocument(
            doc_id="syn-jurisdiction-and-template-leak",
            title="Jurisdiction Alteration & Template Instruction Leak",
            description="Changes exclusive jurisdiction to Kolkata (CRITICAL) and leaks drafter instructions into Clause 5b (MINOR).",
            vendor_text=vendor_text_3,
            master_text=STANDARD_MASTER_PBG,
            injected_anomalies=[
                asdict(
                    InjectedAnomaly(
                        id="anom-03a",
                        name="Jurisdiction Alteration",
                        clause_no="Clause 6",
                        appearing_in_bg="jurisdiction of the Courts at Kolkata",
                        should_be_corrected_as="exclusive jurisdiction of the Courts at New Delhi",
                        severity="CRITICAL",
                        reason="Changes agreed governing forum from New Delhi to Kolkata, compromising IOCL legal rights.",
                    )
                ),
                asdict(
                    InjectedAnomaly(
                        id="anom-03b",
                        name="Drafting Instruction Leak",
                        clause_no="Clause 5",
                        appearing_in_bg="(here put the entire period required for performance plus 3 months)",
                        should_be_corrected_as="The above content should be removed, as it is not part of the approved PBG format.",
                        severity="MINOR",
                        reason="Retains draft template instructional text verbatim.",
                    )
                ),
            ],
        )
    )

    return suite
