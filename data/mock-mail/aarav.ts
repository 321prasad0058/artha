// A fictional inbox for a NEW user built from Gmail: Aarav Deshmukh, 28, product engineer in Pune, family in Dhule.
// Marathi with family, Hindi with friends and the landlord, English for work, bills and travel. Nobody real: every
// sender is on the reserved `.example` domain and every company is invented. Only relevant mail (no newsletters).
// Built-in test: two Rohits (Rohit Sharma, trek friend · Rohit Patil, colleague).
import type { MockMail } from './rohan.ts';

const k = (m: Omit<MockMail, 'category' | 'expect'> & { category?: MockMail['category'] }): MockMail => ({ category: 'personal', expect: 'keep', ...m });

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
    body: 'Bhai,\n\nSaturday subah 5 baje Sinhagad trek pakka. Main tujhe Baner se pick karunga. Torch aur paani le aana.\nAur pichle trek ka ₹800 abhi bhi baaki hai tera mere upar 😄\n\nRohit' }),
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
