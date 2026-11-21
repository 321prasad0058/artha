// A fictional inbox for the demo persona Rohan Mehra (Gurugram). Nobody real: every sender uses the reserved
// `.example` domain (RFC 2606, can never be registered), and every company is invented. Dates are relative to "now"
// so the inbox always looks recent. Includes deliberate noise (newsletters, sales, an OTP mail, a phishing mail)
// to prove the connector's triage skips or flags it.
export type MockMail = {
  id: string; daysAgo: number; time: string; fromName: string; from: string; subject: string; body: string;
  category: 'personal' | 'updates' | 'promotions' | 'social'; bulk?: boolean;
  expect: 'keep' | 'skip' | 'never-store' | 'flag-scam';
};

export const ROHAN_INBOX: MockMail[] = [
  // ---- people in his life
  { id: 'r-ayush-s', daysAgo: 2, time: '21:14', fromName: 'Ayush Sharma', from: 'ayush.sharma@mail.example', category: 'personal', expect: 'keep',
    subject: 'Sunday match + Goa hisaab',
    body: 'Bhai,\n\nSunday ka match pakka, 7 baje Tau Devi Lal. Bat le aana, mera wala toot gaya.\n\nAur Goa trip ka hisaab: tera ₹1,500 mere upar baaki hai, salary aate hi bhej dunga (1 tareekh).\n\n- Ayush' },
  { id: 'r-ayush-g', daysAgo: 1, time: '18:40', fromName: 'Ayush Gupta', from: 'ayush.gupta@finpay.example', category: 'personal', expect: 'keep',
    subject: 'Payments dashboard: fix needed before Monday standup',
    body: 'Hi Rohan,\n\nProduct flagged the settlement totals on the payments dashboard again. Can you push the SQL fix before Monday\'s 10 AM standup? I\'ll review the PR on Sunday night.\n\nThanks,\nAyush Gupta\nData Engineering, FinPay' },
  { id: 'r-priya-hr', daysAgo: 3, time: '11:05', fromName: 'Priya Nair', from: 'priya.nair@finpay.example', category: 'personal', expect: 'keep',
    subject: 'Your appraisal discussion: Tuesday 3 PM',
    body: 'Hi Rohan,\n\nYour annual appraisal discussion is scheduled for Tuesday at 3:00 PM in Meeting Room Neem (3rd floor). Please submit your self-review on the HR portal by Monday 6 PM.\n\nRegards,\nPriya Nair\nHR Business Partner, FinPay' },
  { id: 'r-priya-c', daysAgo: 9, time: '20:30', fromName: 'Priya Mehra', from: 'priya.mehra@mail.example', category: 'personal', expect: 'keep',
    subject: 'Save the date: my engagement, 13 Dec, Pune 💍',
    body: 'Rohan!!\n\nOfficially: my engagement is on Sunday 13 December, 6 PM at Hotel Shalimar Gardens, Koregaon Park, Pune. You HAVE to come. Book your tickets early, it\'s wedding season.\n\nLove,\nPriya didi' },
  { id: 'r-mummy', daysAgo: 4, time: '19:22', fromName: 'Sunita Mehra', from: 'sunita.mehra@mail.example', category: 'personal', expect: 'keep',
    subject: 'Lohri',
    body: 'Beta,\n\nDiwali pe nahi aaya, Lohri pe toh aa ja. 13 January ko hai. Tickets abhi dekh le, baad mein mehenge ho jaate hain.\n\nMummy' },
  { id: 'r-neha', daysAgo: 1, time: '13:02', fromName: 'Neha', from: 'neha.k@mail.example', category: 'personal', expect: 'keep',
    subject: 'Friday dinner?',
    body: 'Friday 8 PM Burma Burma, Sector 29? I\'ve booked a table for two (veg menu is great). Don\'t be late this time 😄' },
  { id: 'r-kabir', daysAgo: 6, time: '23:11', fromName: 'Kabir', from: 'kabir.k@mail.example', category: 'personal', expect: 'keep',
    subject: 'Nov bills split',
    body: 'Bro, Nov ka split:\n- WiFi ₹1,178 (maine pay kiya)\n- Electricity ₹2,340 (tune pay kiya)\nNet tujhe mujhe ₹581 dene hain. UPI kar de jab time mile.' },
  { id: 'r-kapoor', daysAgo: 5, time: '10:00', fromName: 'R. K. Kapoor', from: 'rk.kapoor@mail.example', category: 'personal', expect: 'keep',
    subject: 'December rent reminder',
    body: 'Dear Rohan,\n\nKindly transfer December rent of ₹28,000 and society maintenance of ₹2,500 by 5th December to UPI kapoor.rent@okexample.\n\nRegards,\nR. K. Kapoor' },
  // ---- appointments, travel, orders, bills, payments
  { id: 'r-dentist', daysAgo: 2, time: '09:30', fromName: 'Khanna Dental Care', from: 'appointments@khannadental.example', category: 'updates', expect: 'keep',
    subject: 'Reminder: root canal follow-up on Wednesday, 6:00 PM',
    body: 'Dear Rohan Mehra,\n\nThis is a reminder of your root canal follow-up with Dr. Khanna on Wednesday at 6:00 PM, Khanna Dental Care, Sector 44, Gurugram.\nPlease arrive 10 minutes early. To reschedule, reply to this email.\n\nKhanna Dental Care' },
  { id: 'r-gym', daysAgo: 1, time: '07:45', fromName: 'Pulse Fitness', from: 'noreply@pulsefitness.example', category: 'updates', expect: 'keep',
    subject: 'Session booked: Leg day with Vikram, Wednesday 7:00 AM',
    body: 'Your session is confirmed.\nTrainer: Vikram\nWhen: Wednesday, 7:00 AM\nWhere: Pulse Fitness, Sector 45\nCancel up to 2 hours before without a charge.' },
  { id: 'r-flight', daysAgo: 7, time: '16:20', fromName: 'SkyIndia Airlines', from: 'bookings@skyindia.example', category: 'updates', expect: 'keep',
    subject: 'Booking confirmed: Delhi → Pune, 12 Dec · PNR K7QX2M',
    body: 'Hello Rohan Mehra,\n\nYour flight is confirmed.\nSI 482 · Delhi (DEL) 07:40 → Pune (PNQ) 09:55 · Saturday, 12 December\nPNR: K7QX2M · Seat 14C\nReturn: SI 483 · Pune 21:10 → Delhi 23:20 · Monday, 14 December\n\nSkyIndia Airlines' },
  { id: 'r-order', daysAgo: 2, time: '12:10', fromName: 'QuickKart', from: 'orders@quickkart.example', category: 'updates', expect: 'keep',
    subject: 'Shipped: Stride Runner 2 running shoes',
    body: 'Your order #QK-55821 (Stride Runner 2, size 9) has shipped and will arrive by Tuesday. Pay on delivery: ₹3,499.' },
  { id: 'r-card', daysAgo: 8, time: '08:00', fromName: 'Saffron Bank', from: 'statements@saffronbank.example', category: 'updates', expect: 'keep',
    subject: 'Your credit card statement: ₹18,420 due on 28 Nov',
    body: 'Dear Customer,\n\nYour Saffron Bank credit card statement (card ending 4421) is ready.\nTotal amount due: ₹18,420\nMinimum due: ₹920\nPayment due date: 28 November\n\nSaffron Bank' },
  { id: 'r-upi', daysAgo: 6, time: '23:40', fromName: 'Saffron Bank', from: 'alerts@saffronbank.example', category: 'updates', expect: 'keep',
    subject: 'UPI debit alert: ₹589 to Kabir',
    body: 'Rs.589.00 debited from A/c XX7731 to Kabir (kabir.k@okexample) via UPI. Ref 642210933781. If not you, call 1800-000-0000.' },
  { id: 'r-broadband', daysAgo: 4, time: '09:00', fromName: 'NetLink Broadband', from: 'billing@netlink.example', category: 'updates', expect: 'keep',
    subject: 'Bill ready: ₹1,178 due 25 Nov',
    body: 'Your NetLink Broadband bill for November is ₹1,178 (200 Mbps plan). Due date: 25 November. Account 70019823.' },
  { id: 'r-sprint', daysAgo: 0, time: '09:15', fromName: 'Ayush Gupta', from: 'ayush.gupta@finpay.example', category: 'personal', expect: 'keep',
    subject: 'Invitation: Sprint planning, Monday 11:00 AM',
    body: 'You are invited to: Sprint planning (payments squad)\nWhen: Monday, 11:00 AM – 12:00 PM\nWhere: Google Meet\nOrganizer: Ayush Gupta' },
  // ---- noise the connector must skip
  { id: 'r-news1', daysAgo: 1, time: '06:00', fromName: 'Startup Weekly', from: 'digest@startupweekly.example', category: 'promotions', bulk: true, expect: 'skip',
    subject: 'This week: 12 fintech rounds you missed', body: 'Top funding rounds, hiring moves and a deep dive on UPI credit. Unsubscribe any time.' },
  { id: 'r-sale1', daysAgo: 2, time: '10:00', fromName: 'QuickKart', from: 'offers@quickkart.example', category: 'promotions', bulk: true, expect: 'skip',
    subject: 'BIG WINTER SALE: up to 70% off 🔥', body: 'Jackets, shoes and more. Sale ends Sunday midnight.' },
  { id: 'r-sale2', daysAgo: 5, time: '18:00', fromName: 'FoodRun', from: 'deals@foodrun.example', category: 'promotions', bulk: true, expect: 'skip',
    subject: '50% off your next 3 orders', body: 'Use code HUNGRY50. Valid this week only.' },
  { id: 'r-social1', daysAgo: 3, time: '14:00', fromName: 'JobNet', from: 'jobs@jobnet.example', category: 'social', bulk: true, expect: 'skip',
    subject: '5 new data analyst jobs in Gurugram', body: 'Companies are looking at your profile. See jobs.' },
  { id: 'r-news2', daysAgo: 8, time: '07:00', fromName: 'Cricket Daily', from: 'news@cricketdaily.example', category: 'promotions', bulk: true, expect: 'skip',
    subject: 'Match report: India seal the series', body: 'Highlights, scorecard and player ratings.' },
  { id: 'r-social2', daysAgo: 4, time: '21:00', fromName: 'PhotoGram', from: 'notify@photogram.example', category: 'social', bulk: true, expect: 'skip',
    subject: 'Neha and 3 others liked your photo', body: 'See what your friends are up to.' },
  // ---- must never be stored: one-time passwords
  { id: 'r-otp', daysAgo: 0, time: '08:12', fromName: 'Saffron Bank', from: 'alerts@saffronbank.example', category: 'updates', expect: 'never-store',
    subject: 'OTP for your transaction', body: 'Your one-time password is 482913 for a transaction of ₹2,499. Do not share it with anyone.' },
  // ---- must be flagged: phishing
  { id: 'r-phish', daysAgo: 1, time: '15:33', fromName: 'Telecom KYC Team', from: 'kyc-update@telecom-verify.example', category: 'updates', expect: 'flag-scam',
    subject: 'URGENT: your SIM will be blocked today, complete KYC now', body: 'Dear user, your SIM will be blocked in 2 hours. Click the link and share the OTP sent to your phone to verify KYC.' },
];
