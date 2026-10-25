const COMPANY = "Nature's Mix";
const APP_NAME = 'QuickBooks Connector';
const PLATFORM = "Nature's Mix Production Batch & Traceability ERP";
const EMAIL = 'info@naturesmix.ca';
const ADDRESS = '53 Cowansview Unit I, Cambridge, Ontario N1R 7L2, Canada';
const WEBSITE = 'https://naturesmix.ca';
const EFFECTIVE = 'October 25, 2026';
const UPDATED = 'October 25, 2026';

const H = ({ children }) => (
  <h2 className="text-lg font-bold text-slate-900 mt-8 mb-3">{children}</h2>
);
const H3 = ({ children }) => (
  <h3 className="text-sm font-bold text-slate-800 mt-5 mb-2">{children}</h3>
);
const UL = ({ items }) => (
  <ul className="list-disc pl-6 space-y-1.5 text-slate-700 text-sm leading-relaxed">
    {items.map((i, k) => <li key={k}>{i}</li>)}
  </ul>
);
const P = ({ children }) => (
  <p className="text-slate-700 text-sm leading-relaxed mb-3">{children}</p>
);

const Contact = () => (
  <ul className="text-sm text-slate-700 space-y-1.5 mt-2">
    <li><strong>Entity:</strong> {COMPANY}</li>
    <li><strong>Privacy Officer / Contact:</strong> John G</li>
    <li><strong>Email:</strong> <a className="text-emerald-700 underline" href={`mailto:${EMAIL}`}>{EMAIL}</a></li>
    <li><strong>Mailing Address:</strong> {ADDRESS}</li>
    <li><strong>Website:</strong> <a className="text-emerald-700 underline" href={WEBSITE}>{WEBSITE}</a></li>
  </ul>
);

function PrivacyPolicy() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-slate-900">Privacy Policy</h1>
      <p className="text-slate-500 text-sm mt-1">{APP_NAME}</p>
      <p className="text-slate-500 text-sm mb-6">Effective Date: {EFFECTIVE} · Last Updated: {UPDATED}</p>

      <P>
        {COMPANY} ("we", "us", or "our") operates the {APP_NAME} (the "Application" or "Connector"), part of {PLATFORM}.
        This Privacy Policy explains how we collect, use, process, store, and protect information when you connect and
        use our integration with Intuit QuickBooks Online.
      </P>

      <H>1. Information We Collect</H>
      <P>When you authenticate and authorize our Connector via Intuit OAuth 2.0, we collect and process the following categories of data:</P>
      <H3>A. Intuit Account &amp; Authentication Data</H3>
      <UL items={[
        'Intuit Realm ID (Company ID).',
        'OAuth 2.0 Access Tokens and Refresh Tokens (used exclusively to execute authorized API synchronization requests).',
        'Basic administrative contact details associated with the integration connection (such as name and email address).',
      ]} />
      <H3>B. Synchronized Accounting Data</H3>
      <P>
        Depending on the features configured in your {PLATFORM} settings, the Connector accesses and synchronizes
        accounting objects from your QuickBooks Online account via the Intuit REST API, which may include:
      </P>
      <UL items={[
        <><strong>Customer &amp; Vendor Information:</strong> names, business names, billing addresses, shipping addresses, phone numbers, and email addresses.</>,
        <><strong>Financial &amp; Transactional Records:</strong> invoices, estimates, bills, line items, payment statuses, balances, and transaction dates.</>,
        <><strong>General Ledger &amp; Inventory:</strong> chart of accounts, items/products, SKUs, and tax rates.</>,
      ]} />
      <H3>C. Technical &amp; Audit Logs</H3>
      <UL items={[
        'API request timestamps, HTTP response statuses, and Intuit transaction IDs (intuit_tid) used strictly for troubleshooting and sync verification.',
        'Error logs and operational health metrics.',
      ]} />

      <H>2. How We Use Your Information</H>
      <P>We use the data collected strictly for the following purposes:</P>
      <UL items={[
        <><strong>Service Delivery:</strong> to map, format, and synchronize records between {PLATFORM} and QuickBooks Online.</>,
        <><strong>Troubleshooting &amp; Support:</strong> to diagnose sync discrepancies, API rate-limit errors, or integration failures requested by you.</>,
        <><strong>Security &amp; Verification:</strong> to verify authorization and prevent unauthorized API requests.</>,
      ]} />
      <H3>We do NOT:</H3>
      <UL items={[
        'Sell, rent, or lease your QuickBooks financial or customer data to third parties.',
        'Use your QuickBooks data for targeted third-party advertising or marketing.',
        'Use your proprietary business or financial data to train public artificial intelligence models.',
      ]} />

      <H>3. Data Storage, Security, and Protection</H>
      <P>We implement industry-standard administrative, physical, and technical controls to safeguard your data, in alignment with Intuit's developer security standards:</P>
      <UL items={[
        <><strong>Encryption in Transit:</strong> all data transmitted between your browser, our servers, and Intuit's API endpoints is encrypted using TLS 1.2 or higher.</>,
        <><strong>Encryption at Rest:</strong> all stored credentials, OAuth refresh tokens, and persistent operational records are stored using AES-256 encryption.</>,
        <><strong>Access Control:</strong> access to operational databases and production logs is restricted on a least-privilege basis to authorized technical personnel.</>,
      ]} />

      <H>4. Third-Party Sharing and Disclosures</H>
      <P>We do not disclose your synchronized financial data to third parties, except in the following limited circumstances:</P>
      <UL items={[
        <><strong>Service Providers:</strong> trusted cloud infrastructure and database hosting vendors (e.g., AWS, Google Cloud, Microsoft Azure) bound by strict confidentiality and data protection agreements.</>,
        <><strong>Intuit Inc.:</strong> transaction data submitted back to QuickBooks via official Intuit APIs per your setup.</>,
        <><strong>Legal Compliance:</strong> when required by applicable law, court order, or governmental regulation.</>,
      ]} />

      <H>5. Data Retention and Account Disconnection</H>
      <UL items={[
        <><strong>Active Connections:</strong> we retain sync mapping records and tokens as long as the integration remains active.</>,
        <><strong>Disconnection:</strong> you can revoke {COMPANY}'s access to your QuickBooks Online data at any time via your QuickBooks Online account (Apps → My Apps → Disconnect) or the integration settings inside {PLATFORM}.</>,
        <><strong>Data Deletion:</strong> upon disconnection or receipt of an Intuit disconnect webhook, all stored OAuth tokens are immediately invalidated. You may request permanent deletion of historical synchronization logs by emailing <a className="text-emerald-700 underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>.</>,
      ]} />

      <H>6. Your Rights</H>
      <P>Depending on your jurisdiction (e.g., GDPR, CCPA/CPRA, PIPEDA), you have the right to:</P>
      <UL items={[
        'Request access to the personal data we hold about you.',
        'Request correction of inaccurate information.',
        'Request deletion of your personal data.',
        'Withdraw consent to future data processing.',
      ]} />
      <p className="text-slate-700 text-sm leading-relaxed mt-3">
        To exercise any of these rights, contact our Privacy Officer using the details below.
      </p>

      <H>7. Changes to This Privacy Policy</H>
      <P>We may update this Privacy Policy from time to time to reflect operational or legal updates. Any revisions will be published on this page with an updated "Last Updated" date.</P>

      <H>8. Contact Information</H>
      <P>If you have questions regarding this Privacy Policy, our data practices, or the QuickBooks integration, please contact:</P>
      <Contact />
    </>
  );
}

function Terms() {
  return (
    <>
      <h1 className="text-3xl font-extrabold text-slate-900">Terms and Conditions</h1>
      <p className="text-slate-500 text-sm mt-1">{APP_NAME}</p>
      <p className="text-slate-500 text-sm mb-6">Effective Date: {EFFECTIVE} · Last Updated: {UPDATED}</p>

      <P>
        These Terms and Conditions ("Terms") govern your access to and use of the {APP_NAME} and {PLATFORM}
        (together, the "Service"), operated by {COMPANY} ("we", "us", or "our"). By accessing or using the Service,
        or by connecting your QuickBooks Online account, you agree to be bound by these Terms and our{' '}
        <a className="text-emerald-700 underline" href="/privacy">Privacy Policy</a>. If you do not agree, do not use the Service.
      </P>

      <H>1. The Service</H>
      <P>
        The Service provides production batch tracking, lot traceability, shipping, and recall-reporting tools, and an
        integration that synchronizes records between {PLATFORM} and Intuit QuickBooks Online through the Intuit API.
        The Service is intended for business use by authorized personnel only.
      </P>

      <H>2. Accounts and Access</H>
      <UL items={[
        'Accounts are issued to authorized users. You are responsible for keeping your credentials confidential and for all activity under your account.',
        'You must notify us promptly at the email below if you suspect unauthorized access.',
        'You must have the authority to connect the QuickBooks Online company you authorize, and to bind your organization to these Terms.',
      ]} />

      <H>3. QuickBooks Online Integration</H>
      <UL items={[
        'Connecting to QuickBooks Online uses Intuit OAuth 2.0. You authorize us to access and, as configured, create or update records in your QuickBooks company on your behalf.',
        "Your use of QuickBooks Online remains subject to your agreement with Intuit Inc. and Intuit's terms and policies. We are not affiliated with, endorsed by, or sponsored by Intuit.",
        'You may revoke our access at any time from QuickBooks Online (Apps → My Apps → Disconnect) or from the integration settings within the Service. Synchronization stops on revocation.',
        'You are responsible for reviewing synchronized records (such as invoices) for accuracy within your accounting system.',
      ]} />

      <H>4. Acceptable Use</H>
      <P>You agree not to:</P>
      <UL items={[
        'Use the Service for unlawful purposes or in violation of any applicable regulations, including food-safety record-keeping requirements.',
        "Attempt to gain unauthorized access to the Service, other users' data, or connected systems, or interfere with its operation or security.",
        'Reverse engineer, copy, resell, or sublicense the Service except as permitted by law or in writing by us.',
        'Upload malicious code, or submit data you have no right to submit.',
        'Circumvent API rate limits or other technical restrictions, including those imposed by Intuit.',
      ]} />

      <H>5. Your Data</H>
      <P>
        You retain ownership of all data you submit to or synchronize through the Service ("Your Data"). You grant us a
        limited license to process Your Data solely to provide, secure, and support the Service. How we handle personal
        and financial information is described in our <a className="text-emerald-700 underline" href="/privacy">Privacy Policy</a>.
        You are responsible for the accuracy and legality of Your Data and for maintaining your own backups.
      </P>

      <H>6. Intellectual Property</H>
      <P>
        The Service, including its software, design, and documentation, is owned by {COMPANY} or its licensors and is
        protected by intellectual property laws. We grant you a limited, non-exclusive, non-transferable, revocable right
        to use the Service for your internal business operations in accordance with these Terms.
      </P>

      <H>7. Availability and Changes</H>
      <P>
        We aim to keep the Service available but do not guarantee uninterrupted or error-free operation. The Service
        depends on third-party platforms (including Intuit's API and cloud hosting providers) whose availability or
        changes may affect functionality. We may modify, suspend, or discontinue features with reasonable notice where practicable.
      </P>

      <H>8. Disclaimer of Warranties</H>
      <P>
        The Service is provided "as is" and "as available", without warranties of any kind, express or implied, including
        implied warranties of merchantability, fitness for a particular purpose, and non-infringement, to the fullest extent
        permitted by law. The Service is a record-keeping aid; you remain solely responsible for your regulatory compliance,
        including recall decisions and food-safety obligations.
      </P>

      <H>9. Limitation of Liability</H>
      <P>
        To the fullest extent permitted by law, {COMPANY} will not be liable for any indirect, incidental, special,
        consequential, or punitive damages, or for loss of profits, revenue, data, or goodwill, arising from your use of the
        Service. Our total liability for any claim relating to the Service will not exceed the amount you paid us for the Service
        in the twelve (12) months preceding the claim.
      </P>

      <H>10. Indemnification</H>
      <P>
        You agree to indemnify and hold harmless {COMPANY} from claims, losses, and expenses (including reasonable legal fees)
        arising from your breach of these Terms or your misuse of the Service.
      </P>

      <H>11. Suspension and Termination</H>
      <P>
        We may suspend or terminate your access if you breach these Terms or if required for security or legal reasons. You may
        stop using the Service and disconnect QuickBooks at any time. On termination, tokens are invalidated and data is handled
        as set out in the Privacy Policy. Sections that by their nature should survive termination will survive.
      </P>

      <H>12. Governing Law</H>
      <P>
        These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein,
        without regard to conflict-of-law principles. The courts of Ontario have exclusive jurisdiction over any dispute arising from these Terms.
      </P>

      <H>13. Changes to These Terms</H>
      <P>
        We may update these Terms from time to time. Revisions will be posted on this page with an updated "Last Updated" date.
        Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
      </P>

      <H>14. Contact Information</H>
      <P>Questions about these Terms can be sent to:</P>
      <Contact />
    </>
  );
}

export const LEGAL_PATHS = ['/privacy', '/terms'];

export default function LegalPages({ path }) {
  const isPrivacy = path === '/privacy';
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" className="font-extrabold text-sm tracking-tight">{COMPANY}</a>
          <nav className="flex gap-5 text-sm">
            <a href="/privacy" className={isPrivacy ? 'font-bold underline' : 'text-slate-300 hover:text-white'}>Privacy Policy</a>
            <a href="/terms" className={!isPrivacy ? 'font-bold underline' : 'text-slate-300 hover:text-white'}>Terms</a>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">
        <article className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-10">
          {isPrivacy ? <PrivacyPolicy /> : <Terms />}
        </article>
        <footer className="text-center text-xs text-slate-500 mt-6">
          © {new Date().getFullYear()} {COMPANY}. <a href="/" className="underline">Back to app</a>
        </footer>
      </main>
    </div>
  );
}
