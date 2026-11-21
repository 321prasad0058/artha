// A fictional inbox for a NEW user built from Gmail: Aarav Deshmukh, 28, product engineer in Pune, family in Dhule.
// Marathi with family, Hindi with friends and the landlord, English for work, bills and travel. Nobody real: every
// sender is on the reserved `.example` domain and every company is invented. Only relevant mail (no newsletters).
// Built-in test: two Rohits (Rohit Sharma, trek friend · Rohit Patil, colleague).
import type { MockMail } from './rohan.ts';

const k = (m: Omit<MockMail, 'category' | 'expect'> & { category?: MockMail['category']; expect?: MockMail['expect'] }): MockMail => ({ category: 'personal', expect: 'keep', ...m });

export const AARAV_INBOX: MockMail[] = [
  // ---- family, in Marathi
  k({ id: 'a-aai', daysAgo: 1, time: '20:15', fromName: 'Aai', from: 'aai.deshmukh@mail.example', subject: 'संक्रांतीला घरी ये',
    body: 'आरव,\n\nदिवाळीला तू आला नाहीस. संक्रांतीला तरी घरी ये, १४ जानेवारीला. तिळगुळ करणार आहे.\nआणि बाबांची तपासणी २ डिसेंबरला सकाळी ११ वाजता धुळ्यात डॉ. जोशींकडे आहे, त्यांना फोन करून आठवण करून दे.\n\nतुझी आई' }),
  k({ id: 'a-baba', daysAgo: 3, time: '08:40', fromName: 'Baba', from: 'vinayak.deshmukh@mail.example', subject: 'कर्जाचा हप्ता',
    body: 'आरव,\n\nशेतीच्या कर्जाचा हप्ता ₹12,500 या महिन्यात ५ तारखेपर्यंत भरायचा आहे. तू पाठवशील का? बँकेचा खाते क्रमांक तुला माहिती आहे.\n\nबाबा' }),
  k({ id: 'a-tai', daysAgo: 2, time: '22:05', fromName: 'Sayali Tai', from: 'sayali.joshi@mail.example', subject: 'मीराचा वाढदिवस 🎂',
    body: 'आरव,\n\nमीराचा (तुझ्या भाचीचा) पाचवा वाढदिवस ६ डिसेंबरला नाशिकला आहे, संध्याकाळी ६ वाजता. केक मी ऑर्डर करते, तू तिच्यासाठी ड्रॉइंग किट आण. तिला खूप आवडेल.\n\nताई' }),
  k({ id: 'a-mama', daysAgo: 6, time: '11:30', fromName: 'Mama (Prakash Patil)', from: 'prakash.patil@mail.example', subject: 'लग्नाचे आमंत्रण: चि. ओंकार आणि चि. सौ. कां. स्नेहा',
    body: 'प्रिय आरव,\n\nआमचा ओंकार आणि स्नेहा यांचे लग्न १८ डिसेंबरला धुळ्यात, मंगल कार्यालय, साक्री रोड येथे दुपारी १२:३० वाजता आहे. हळद १७ डिसेंबरला संध्याकाळी. नक्की या.\n\nतुमचा मामा,\nप्रकाश पाटील' }),
  k({ id: 'a-kaka', daysAgo: 9, time: '17:10', fromName: 'Sunil Kaka', from: 'sunil.deshmukh@mail.example', subject: 'जमिनीचे कागद',
    body: 'आरव,\n\nलग्नाला येशील तेव्हा १७ तारखेला तहसील ऑफिसला जायचे आहे. ७/१२ उतारा आणि आधार कार्डाची झेरॉक्स घेऊन ये.\n\nकाका' }),
  k({ id: 'a-society', daysAgo: 5, time: '10:00', fromName: 'Shantiniketan Society, Baner', from: 'secretary@shantiniketan.example', subject: 'देखभाल शुल्क: डिसेंबर',
    body: 'नमस्कार,\n\nफ्लॅट B-704 साठी डिसेंबरचे देखभाल शुल्क ₹3,200 आहे, १० डिसेंबरपर्यंत भरावे.\n\nसचिव, शांतिनिकेतन सोसायटी, बाणेर' }),
  // ---- friends and the landlord, in Hindi
  k({ id: 'a-rohit-s', daysAgo: 2, time: '21:40', fromName: 'Rohit Sharma', from: 'rohit.sharma@mail.example', subject: 'Sinhagad trek, Saturday',
    body: 'Bhai,\n\nSaturday subah 5 baje Sinhagad trek pakka. Main tujhe Baner se pick karunga. Torch aur paani le aana.\nAur pichle trek ke ₹800 jo maine tujhse liye the, kal UPI kar dunga.\n\nRohit' }),
  k({ id: 'a-priya', daysAgo: 4, time: '19:05', fromName: 'Priya Verma', from: 'priya.verma@mail.example', subject: 'Pune aa rahi hoon!',
    body: 'Aarav!\n\n12 December ko Pune aa rahi hoon conference ke liye. Shaam ko mil sakte hain? Koregaon Park mein kahin dinner karte hain, college ki yaad mein.\n\nPriya' }),
  k({ id: 'a-landlord', daysAgo: 4, time: '09:15', fromName: 'Mahesh Agarwal', from: 'mahesh.agarwal@mail.example', subject: 'December ka kiraya',
    body: 'Aarav ji,\n\nDecember ka kiraya ₹22,000, 5 tareekh tak bhej dijiye. UPI: agarwal.flats@okexample.\nAur geyser theek karwa diya hai.\n\nMahesh Agarwal' }),
  // ---- work, in English
  k({ id: 'a-rohit-p', daysAgo: 1, time: '17:20', fromName: 'Rohit Patil', from: 'rohit.patil@ledgerly.example', subject: 'Release on Thursday: please review my PR',
    body: 'Hi Aarav,\n\nThe UPI autopay release goes out on Thursday. Could you review my PR #482 (mandate retries) by Wednesday evening? QA signs off Thursday morning.\n\nThanks,\nRohit Patil\nBackend, Ledgerly' }),
  k({ id: 'a-manager', daysAgo: 2, time: '12:00', fromName: 'Sneha Iyer', from: 'sneha.iyer@ledgerly.example', subject: '1:1 on Friday at 4 PM',
    body: 'Hi Aarav,\n\nLet\'s do our 1:1 on Friday at 4 PM. Bring your Q1 roadmap draft for the autopay squad, and let\'s talk about your promotion case.\n\nSneha' }),
  k({ id: 'a-hr', daysAgo: 7, time: '15:30', fromName: 'Ledgerly People Team', from: 'people@ledgerly.example', category: 'updates', subject: 'Health insurance: add your parents by 10 December',
    body: 'Hi Aarav,\n\nOpen enrolment for parental health cover closes on 10 December. Premium for two parents: ₹14,200 a year, deducted from salary. Add them on the HR portal.\n\nPeople Team, Ledgerly' }),
  // ---- appointments, travel, bills, payments
  k({ id: 'a-dentist', daysAgo: 1, time: '09:00', fromName: 'Smile Care Clinic', from: 'appointments@smilecare.example', category: 'updates', subject: 'Appointment confirmed: Tuesday 7:30 PM',
    body: 'Dear Aarav Deshmukh,\n\nYour dental cleaning with Dr. Kulkarni is confirmed for Tuesday at 7:30 PM at Smile Care Clinic, Baner Road, Pune.\n\nSmile Care Clinic' }),
  k({ id: 'a-train', daysAgo: 8, time: '13:45', fromName: 'RailYatra', from: 'tickets@railyatra.example', category: 'updates', subject: 'Ticket booked: Pune → Dhule, 16 Dec · PNR 8421337065',
    body: 'Hello Aarav Deshmukh,\n\nYour ticket is confirmed.\nTrain 11025 · Pune (PUNE) 21:10 → Dhule (DHI) 06:40 next day · Wednesday, 16 December\nCoach B2, berth 34 (lower)\nPNR 8421337065\n\nRailYatra' }),
  k({ id: 'a-card', daysAgo: 6, time: '08:00', fromName: 'Kesari Bank', from: 'cards@kesaribank.example', category: 'updates', subject: 'Credit card statement: ₹9,850 due on 30 Nov',
    body: 'Dear Customer,\n\nYour Kesari Bank credit card statement is ready.\nTotal due: ₹9,850 · Minimum due: ₹500 · Due date: 30 November\n\nKesari Bank' }),
  k({ id: 'a-power', daysAgo: 4, time: '07:30', fromName: 'MahaPower', from: 'billing@mahapower.example', category: 'updates', subject: 'Electricity bill ₹1,420 due 28 Nov',
    body: 'Consumer no. 170019842 · Flat B-704, Baner. November bill: ₹1,420. Due date: 28 November. Pay online to avoid a late fee.' }),
  k({ id: 'a-upi', daysAgo: 3, time: '21:02', fromName: 'Kesari Bank', from: 'alerts@kesaribank.example', category: 'updates', subject: 'UPI debit: ₹2,000 to Sayali Joshi',
    body: 'Rs.2,000.00 debited from A/c XX5520 to Sayali Joshi via UPI. Note: Meera birthday cake. Ref 643310219855.' }),
  k({ id: 'a-order', daysAgo: 1, time: '14:20', fromName: 'QuickKart', from: 'orders@quickkart.example', category: 'updates', subject: 'Order placed: Kids drawing kit (48 colours)',
    body: 'Your order #QK-77102 (Kids drawing kit, 48 colours) will arrive by Thursday. Paid ₹1,299 by UPI.' }),
  k({ id: 'a-badminton', daysAgo: 0, time: '08:10', fromName: 'CourtBook', from: 'bookings@courtbook.example', category: 'updates', subject: 'Court booked: Sunday 7 AM, Baner Sports Arena',
    body: 'Badminton court 3 booked for Sunday 7:00–8:00 AM at Baner Sports Arena. Players: Aarav, Rohit Sharma. Paid ₹400.' }),
];

// ---- more of Aarav's life: work, friends, family, loans, UPI receipts, bills, investments, health, travel, government
const UPI = (id: string, daysAgo: number, time: string, subject: string, body: string) => k({ id, daysAgo, time, fromName: 'PaySetu', from: 'receipts@paysetu.example', category: 'updates', subject, body });
export const AARAV_MORE: MockMail[] = [
  // work
  k({ id: 'a-payslip', daysAgo: 22, time: '10:05', fromName: 'Ledgerly People Team', from: 'people@ledgerly.example', category: 'updates', subject: 'Payslip for October is ready',
    body: 'Hi Aarav,\n\nYour October payslip is on the HR portal. Net pay ₹1,18,400 credited to your Kesari Bank account on 30 October. Tax deducted: ₹14,250.\n\nPeople Team, Ledgerly' }),
  k({ id: 'a-offsite', daysAgo: 10, time: '16:30', fromName: 'Sneha Iyer', from: 'sneha.iyer@ledgerly.example', subject: 'Team offsite: Lonavala, 4–5 December',
    body: 'Hi team,\n\nOur autopay squad offsite is on 4–5 December at Rivendell Resort, Lonavala. Bus leaves the Baner office at 8 AM on the 4th. Bring your Q1 ideas.\n\nSneha' }),
  k({ id: 'a-client', daysAgo: 3, time: '18:10', fromName: 'Karan Mehta', from: 'karan.mehta@paynest.example', subject: 'PayNest integration call, Thursday 11 AM',
    body: 'Hi Aarav,\n\nConfirming our integration call on Thursday at 11 AM about the mandate webhooks. I will share the sandbox keys before the call.\n\nKaran Mehta\nPartnerships, PayNest' }),
  k({ id: 'a-oncall', daysAgo: 12, time: '19:45', fromName: 'Rohit Patil', from: 'rohit.patil@ledgerly.example', subject: 'On-call handover this weekend',
    body: 'Hey Aarav,\n\nYou are on call this Saturday and Sunday for the payments service. Runbook is in the wiki; page me if the settlement job fails.\n\nRohit' }),
  // friends
  k({ id: 'a-reunion', daysAgo: 5, time: '22:30', fromName: 'Nikhil Joshi', from: 'nikhil.joshi@mail.example', subject: 'College reunion – 20 Dec, Pune',
    body: 'Arre Aarav,\n\nCOEP batch reunion Saturday 20 December, 7 PM, at The Irish House, Pune. ₹1,500 per head, UPI to me by 15th. Tu yeshil na? 😄\n\nNikhil' }),
  k({ id: 'a-nikhil-loan', daysAgo: 9, time: '23:05', fromName: 'Nikhil Joshi', from: 'nikhil.joshi@mail.example', subject: 'Tera ₹5,000',
    body: 'Bhai, jo ₹5,000 tune mujhe pichle mahine diye the, next Friday tak lauta dunga. Salary late aayi hai. Sorry yaar.\n\nNikhil' }),
  k({ id: 'a-kunal', daysAgo: 3, time: '21:20', fromName: 'Kunal Shah', from: 'kunal.shah@mail.example', subject: 'Grocery split',
    body: 'Bro, is hafte ka grocery ₹1,140 aaya. Tera half ₹570. Aur Sunday ko maid ki chhutti hai, khana bahar se mangwayenge.\n\nKunal (flatmate)' }),
  k({ id: 'a-priya2', daysAgo: 1, time: '11:40', fromName: 'Priya Verma', from: 'priya.verma@mail.example', subject: 'Dinner pakka: 12 Dec, 8 PM',
    body: 'Booked! 12 December, 8 PM, The Flour Works, Koregaon Park. Table for 2. Tu late mat hona 😄\n\nPriya' }),
  k({ id: 'a-saurabh', daysAgo: 14, time: '20:00', fromName: 'Saurabh Kale', from: 'saurabh.kale@mail.example', subject: 'Shaadi ka card 💌 Nagpur, 26 Jan',
    body: 'Aarav bhai,\n\nMeri shaadi 26 January ko Nagpur mein hai, sangeet 25 ki shaam. Tujhe aana hi hai. Train ya flight jaldi book kar le.\n\nSaurabh' }),
  // family
  k({ id: 'a-aai2', daysAgo: 7, time: '18:30', fromName: 'Aai', from: 'aai.deshmukh@mail.example', subject: 'बाबांचा रिपोर्ट',
    body: 'आरव,\n\nबाबांचा रक्ताचा रिपोर्ट आला. साखर थोडी वाढली आहे, डॉ. जोशी म्हणाले गोड कमी करा. तू त्यांना समजावून सांग, माझं ऐकत नाहीत.\n\nआई' }),
  k({ id: 'a-tai2', daysAgo: 0, time: '09:10', fromName: 'Sayali Tai', from: 'sayali.joshi@mail.example', subject: 'गिफ्ट?',
    body: 'आरव, मीरासाठी ड्रॉइंग किट घेतलंस का? आणि ६ तारखेला दुपारपर्यंत ये, सजावट करायची आहे.\n\nताई' }),
  k({ id: 'a-omkar', daysAgo: 4, time: '20:50', fromName: 'Omkar Patil', from: 'omkar.patil@mail.example', subject: 'लग्नासाठी कुर्ता',
    body: 'दादा, लग्नात सगळ्या भावांचा एकसारखा कुर्ता आहे. तुझी साईज पाठव (M की L?) १० डिसेंबरपर्यंत.\n\nओंकार' }),
  k({ id: 'a-baba2', daysAgo: 0, time: '07:45', fromName: 'Baba', from: 'vinayak.deshmukh@mail.example', subject: 'हप्ता',
    body: 'आरव, कर्जाचा हप्ता भरलास का? बँकेतून आठवणीचा फोन आला होता. ५ तारीख शेवटची आहे.\n\nबाबा' }),
  // loans
  k({ id: 'a-farmloan', daysAgo: 2, time: '11:00', fromName: 'Dhule Gramin Sahakari Bank', from: 'loans@dhulegramin.example', category: 'updates', subject: 'कर्ज हप्ता स्मरणपत्र: ₹12,500 देय ५ डिसेंबर',
    body: 'श्री. विनायक देशमुख (सह-अर्जदार: आरव देशमुख),\n\nआपल्या पीक कर्ज खात्याचा हप्ता ₹12,500 दिनांक ५ डिसेंबर रोजी देय आहे. वेळेवर भरणा करून दंड टाळावा.\n\nधुळे ग्रामीण सहकारी बँक' }),
  k({ id: 'a-eduloan', daysAgo: 3, time: '09:00', fromName: 'Kesari Bank', from: 'loans@kesaribank.example', category: 'updates', subject: 'Education loan EMI ₹8,450 due on 7 December',
    body: 'Dear Aarav Deshmukh,\n\nYour education loan EMI of ₹8,450 is due on 7 December and will be auto-debited from your savings account. Outstanding principal: ₹3,12,600. 37 EMIs remaining.\n\nKesari Bank' }),
  k({ id: 'a-eduloan-paid', daysAgo: 33, time: '09:00', fromName: 'Kesari Bank', from: 'loans@kesaribank.example', category: 'updates', subject: 'EMI received for November',
    body: 'We have received your education loan EMI of ₹8,450 for November. Thank you.\n\nKesari Bank' }),
  // UPI app receipts
  UPI('a-upi-grocery', 2, '19:12', 'Paid ₹1,240 to DailyBasket', 'You paid ₹1,240 to DailyBasket (groceries) from Kesari Bank XX5520. UPI ref 643819220114.'),
  UPI('a-upi-food', 1, '21:35', 'Paid ₹486 to FoodRun', 'You paid ₹486 to FoodRun (food delivery). UPI ref 643901117720.'),
  UPI('a-upi-fuel', 6, '08:20', 'Paid ₹1,000 to FuelPoint, Baner', 'You paid ₹1,000 to FuelPoint Baner (petrol). UPI ref 643522019931.'),
  UPI('a-upi-cab', 4, '23:10', 'Paid ₹312 to RideNow', 'You paid ₹312 to RideNow (cab, Koregaon Park → Baner). UPI ref 643611820045.'),
  UPI('a-upi-rent', 18, '10:30', 'Paid ₹22,000 to Mahesh Agarwal', 'You paid ₹22,000 to Mahesh Agarwal (rent, November). UPI ref 642009871234.'),
  UPI('a-upi-aai', 20, '12:00', 'Sent ₹5,000 to Vaishali Deshmukh', 'You sent ₹5,000 to Vaishali Deshmukh (Aai). Note: ghar kharch. UPI ref 641887120098.'),
  UPI('a-upi-recv-rohit', 1, '09:30', 'Received ₹800 from Rohit Sharma', 'You received ₹800 from Rohit Sharma. Note: trek. UPI ref 643990012345.'),
  UPI('a-upi-chemist', 7, '18:40', 'Paid ₹780 to AushadhMart', 'You paid ₹780 to AushadhMart (pharmacy, Baba\'s medicines delivered to Dhule). UPI ref 643400918877.'),
  UPI('a-upi-kunal', 2, '22:00', 'Paid ₹570 to Kunal Shah', 'You paid ₹570 to Kunal Shah (grocery split). UPI ref 643822210076.'),
  UPI('a-upi-refund', 12, '15:15', 'Refund ₹649 from QuickKart', 'You received a refund of ₹649 from QuickKart (returned T-shirt). UPI ref 642744100233.'),
  UPI('a-upi-month', 0, '07:00', 'Your November spends: ₹38,420', 'November so far: ₹38,420 spent. Rent ₹22,000 · Family ₹7,000 · Food ₹4,120 · Travel ₹2,340 · Groceries ₹1,810 · Health ₹780 · Fuel ₹1,000. Top payee: Mahesh Agarwal.'),
  k({ id: 'a-salary', daysAgo: 22, time: '18:00', fromName: 'Kesari Bank', from: 'alerts@kesaribank.example', category: 'updates', subject: 'Salary credited: ₹1,18,400',
    body: 'Rs.1,18,400.00 credited to A/c XX5520 from LEDGERLY TECHNOLOGIES (salary, October).' }),
  // bills and subscriptions
  k({ id: 'a-mobile', daysAgo: 2, time: '10:00', fromName: 'TeleOne', from: 'care@teleone.example', category: 'updates', subject: 'Your ₹299 plan expires on 30 November',
    body: 'Your TeleOne prepaid plan (2 GB/day) expires on 30 November. Recharge ₹299 to continue.' }),
  k({ id: 'a-stream', daysAgo: 4, time: '12:00', fromName: 'StreamBox', from: 'billing@streambox.example', category: 'updates', subject: 'Membership renews on 3 December: ₹649',
    body: 'Your StreamBox Premium membership renews on 3 December. ₹649 will be charged to your card ending 2210.' }),
  k({ id: 'a-gym', daysAgo: 5, time: '07:30', fromName: 'IronHouse Gym', from: 'desk@ironhouse.example', category: 'updates', subject: 'Membership renewal due 1 December: ₹2,999',
    body: 'Hi Aarav, your quarterly membership at IronHouse Gym, Baner ends on 30 November. Renew for ₹2,999 by 1 December.' }),
  k({ id: 'a-bike', daysAgo: 6, time: '11:20', fromName: 'SuRaksha General Insurance', from: 'renewals@suraksha.example', category: 'updates', subject: 'Bike insurance renewal: ₹1,850 due 15 December',
    body: 'Policy for MH-12 bike (Activa) expires on 15 December. Renewal premium ₹1,850.' }),
  // investments
  k({ id: 'a-sip', daysAgo: 15, time: '09:40', fromName: 'Nidhi Mutual Fund', from: 'sip@nidhimf.example', category: 'updates', subject: 'SIP of ₹5,000 processed',
    body: 'Your monthly SIP of ₹5,000 in Nidhi Flexi Cap Fund has been processed. Next instalment: 7 December.' }),
  k({ id: 'a-ppf', daysAgo: 30, time: '13:00', fromName: 'Kesari Bank', from: 'ppf@kesaribank.example', category: 'updates', subject: 'PPF deposit received: ₹10,000',
    body: 'A deposit of ₹10,000 has been credited to your PPF account. Balance this year: ₹40,000.' }),
  // health
  k({ id: 'a-lab', daysAgo: 8, time: '17:00', fromName: 'Lifeline Labs, Dhule', from: 'reports@lifelinelabs.example', category: 'updates', subject: 'Report ready: Vinayak Deshmukh',
    body: 'The blood test report for Vinayak Deshmukh (age 61) is ready. HbA1c: 7.4% (high). Fasting sugar: 142 mg/dL. Please consult your doctor.' }),
  // travel, shopping, government, society
  k({ id: 'a-flight', daysAgo: 6, time: '15:00', fromName: 'SkyIndia Airlines', from: 'bookings@skyindia.example', category: 'updates', subject: 'Booking confirmed: Pune → Bengaluru, 9 Jan',
    body: 'SI 214 · Pune 07:15 → Bengaluru 08:50 · Saturday, 9 January · PNR B4KQ7Z. Booked by Ledgerly Travel for the partner summit.' }),
  k({ id: 'a-kurta', daysAgo: 3, time: '14:00', fromName: 'QuickKart', from: 'orders@quickkart.example', category: 'updates', subject: 'Delivered: Men\'s cotton kurta (M)',
    body: 'Your order #QK-77355 (men\'s cotton kurta, size M, cream) was delivered. Paid ₹1,099.' }),
  k({ id: 'a-passport', daysAgo: 10, time: '10:10', fromName: 'Passport Portal', from: 'appointments@passportportal.example', category: 'updates', subject: 'Appointment confirmed: 11 December, 10:30 AM',
    body: 'Your passport renewal appointment is confirmed for 11 December at 10:30 AM, Passport Seva Kendra, Mundhwa, Pune. Carry original documents.' }),
  k({ id: 'a-water', daysAgo: 1, time: '08:00', fromName: 'Shantiniketan Society, Baner', from: 'secretary@shantiniketan.example', subject: 'सूचना: रविवारी पाणीपुरवठा बंद',
    body: 'सर्व सभासदांना कळविण्यात येते की टाकी स्वच्छतेसाठी रविवारी सकाळी ९ ते दुपारी १ पाणीपुरवठा बंद राहील.\n\nसचिव' }),
  // a few that must be skipped
  k({ id: 'a-promo1', daysAgo: 2, time: '10:00', fromName: 'QuickKart', from: 'offers@quickkart.example', category: 'promotions', bulk: true, expect: 'skip', subject: 'Wedding season sale: up to 60% off', body: 'Kurtas, sherwanis and more. Ends Sunday.' }),
  k({ id: 'a-promo2', daysAgo: 4, time: '12:00', fromName: 'Kesari Bank', from: 'offers@kesaribank.example', category: 'promotions', bulk: true, expect: 'skip', subject: 'Pre-approved personal loan of ₹5,00,000', body: 'Get instant funds at attractive rates. Apply now.' }),
  k({ id: 'a-news', daysAgo: 1, time: '06:30', fromName: 'Fintech Weekly', from: 'digest@fintechweekly.example', category: 'promotions', bulk: true, expect: 'skip', subject: 'UPI autopay crosses 1 billion mandates', body: 'This week in payments. Unsubscribe any time.' }),
  k({ id: 'a-otp', daysAgo: 0, time: '08:41', fromName: 'Kesari Bank', from: 'alerts@kesaribank.example', category: 'updates', expect: 'never-store', subject: 'OTP for net banking login', body: 'Your one-time password is 774120. Valid for 5 minutes. Do not share it with anyone.' }),
];
