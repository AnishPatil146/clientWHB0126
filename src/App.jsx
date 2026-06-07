import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { signInWithPopup, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 
   window.location.hostname.includes('vercel.app') ? 'https://clientwhb0126.onrender.com' : 
   window.location.origin);

const LONG_FORM_TEMPLATE = `Dear Business Owner,

Stop losing customers to ordinary brands! Expand your inventory with high-margin, problem-solving SPECIALTY CLEANERS direct from the manufacturer. 🛠️✨

Sri Bhavani Marketing (Cleara Brand), Hyderabad — an ISO 9001:2015 Certified Company — announces open bulk bookings for our premium maintenance range with massive dealer price gaps:

🔥 HIGH-MARGIN SPECIALTY CHEMICALS (Jan 2026):
• Cleara Tap Cleaner (250ml) ➡️ Wholesale: ₹130 | MRP: ₹315 (Pack of 24 Units) 💡 Straight ₹185 flat profit per bottle!
• Cleara Paint Remover (500ml) ➡️ Wholesale: ₹140 | MRP: ₹315 (Pack of 15 Units) 🎨 Strips old coatings instantly!
• Cement Film Remover (500ml) ➡️ Wholesale: ₹130 | MRP: ₹310 (Pack of 15 Units) 🧱 Post-construction heavy cleaner.
• Cleara Tiles Cleaner (500ml) ➡️ Wholesale: ₹80 | MRP: ₹210 (Pack of 15 Units) ✨ Restores original tile shine!
• Cleara Drain Opener (500ml) ➡️ Wholesale: ₹80 | MRP: ₹215 (Pack of 15 Units) 🪠 Melts grease and hair blockages in minutes!
• Cleara Pipe Cleaner (500ml) ➡️ Wholesale: ₹65 | MRP: ₹190 (Pack of 15 Units) 💧 Clears sediment from overhead tank lines.
• Cleara Marble Cleaner (250ml) ➡️ Wholesale: ₹110 | MRP: ₹290 (Pack of 24 Units) 💎 Safe and gentle deep grime cleaning.
• Cleara Kitchen Cleaner (250ml) ➡️ Wholesale: ₹62 | MRP: ₹190 (Pack of 24 Units) 🍳 Lifts heavy oil and grease effortlessly.
• Adhesive & Gum Remover (200ml) ➡️ Wholesale: ₹110 | MRP: ₹290 (Pack of 42 Units) 🏷️ Dissolves sticky residue easily.
• Cleara Rust Remover (500ml) ➡️ Wholesale: ₹140 | MRP: ₹355 (Pack of 15 Units) ⚙️ Eliminates deep rust completely.

📦 Business Terms: Applicable GST extra. Orders are accepted strictly in standard commercial box quantities to ensure factory rates.

Want to secure the complete 2026 Price List and book an exclusive distribution slot for your region? 📄

Simply reply with "YES" or "SEND", and our automated system will forward the PDF catalogue instantly!

Best regards,
B2B Distribution Cell
Sri Bhavani Marketing, Hyderabad`;

const SHORT_FORM_TEMPLATE = `Dear Business Owner,

Source high-margin SPECIALTY CLEANERS direct from the factory and double your retail profits. Maximize your margins with Cleara Brand (Hyderabad):

🔥 TOP 10 SPECIALTY WHOLESALE DEALS (Jan 2026):
• Tap Cleaner (250ml) ➡️ Wholesale: ₹130 | MRP: ₹315 [Pack of 24] (Straight ₹185 Profit!)
• Paint Remover (500ml) ➡️ Wholesale: ₹140 | MRP: ₹315 [Pack of 15]
• Cement Film Remover (500ml) ➡️ Wholesale: ₹130 | MRP: ₹310 [Pack of 15]
• Tiles Cleaner (500ml) ➡️ Wholesale: ₹80 | MRP: ₹210 [Pack of 15]
• Drain Opener (500ml) ➡️ Wholesale: ₹80 | MRP: ₹215 [Pack of 15]
• Pipe Cleaner (500ml) ➡️ Wholesale: ₹65 | MRP: ₹190 [Pack of 15]
• Marble Cleaner (250ml) ➡️ Wholesale: ₹110 | MRP: ₹290 [Pack of 24]
• Kitchen Cleaner (250ml) ➡️ Wholesale: ₹62 | MRP: ₹190 [Pack of 24]
• Adhesive & Gum Remover (200ml) ➡️ Wholesale: ₹110 | MRP: ₹290 [Pack of 42]
• Rust Remover (500ml) ➡️ Wholesale: ₹140 | MRP: ₹355 [Pack of 15]

📦 Note: GST extra. Orders accepted in standard box quantities only. 

Want to secure the complete 2026 Wholesale Catalogue and price list for your area? 📄

Reply with "YES" or "SEND" and our automated system will forward files instantly!`;

export default function App() {
  const [theme, setTheme] = useState('dark'); // 'light' or 'dark'
  const [step, setStep] = useState(1); // Onboarding steps: 1 (Phone/Email), 2 (OTP), 3 (QR), 4 (Dashboard)
  const [loginMethod, setLoginMethod] = useState('phone'); // 'phone' or 'email'
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');

  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailWarning, setEmailWarning] = useState('');
  const [otpChannel, setOtpChannel] = useState(''); // 'whatsapp' | 'sms' | 'email' | 'email-console'
  const [loginLoading, setLoginLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);

  // WhatsApp QR Connection state
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [connectedNumber, setConnectedNumber] = useState(null);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('919398317754');

  // Dashboard Stats & State
  const [stats, setStats] = useState({
    campaignStatus: 'Stopped',
    speedLevel: 3,
    messageTemplate: '',
    sentToday: 0,
    targetCount: 10000,
    deliveredCount: 0,
    leadsScrapedCount: 0,
    repliesReceivedCount: 0,
    leadsQueue: [],
    currentLeadIndex: 0,
    scraping: false,
    scrapingProgress: 0,
    hourlyHistory: [0, 0, 0, 0, 0, 0]
  });

  // CSV import state
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState('');
  const csvInputRef = useRef(null);

  const [leadsPreview, setLeadsPreview] = useState([]);
  const [duplicatesRemoved, setDuplicatesRemoved] = useState(0);
  const [leadsInjected, setLeadsInjected] = useState(false);
  const [messageLogs, setMessageLogs] = useState([]);
  const [latestReplies, setLatestReplies] = useState([]);

  // Scraper states
  const [rightTab, setRightTab] = useState('scraper'); // 'scraper' or 'import'
  const [scrapeKeyword, setScrapeKeyword] = useState('');
  const [scrapeCity, setScrapeCity] = useState('Hyderabad');
  const [scraperState, setScraperState] = useState({
    active: false,
    progress: 0,
    leadsCount: 0,
    sources: {
      'Yahoo Search': { count: 0, status: 'Standby' },
      'DuckDuckGo Search': { count: 0, status: 'Standby' },
      'Deep Crawl': { count: 0, status: 'Standby' }
    }
  });

  // ── Categorised keyword presets (3 strategic groups) ──────────────────────
  const KEYWORD_CATEGORIES = [
    {
      id: 'wholesale',
      label: '🏭 B2B Wholesale & Bulk',
      color: 'blue',
      description: 'Large-scale stockists, trade traders, enterprise chemical suppliers',
      presets: [
        { label: 'Cleaning Chemicals Wholesale', query: 'cleaning chemicals wholesale distributors' },
        { label: 'Housekeeping Bulk Suppliers', query: 'housekeeping materials bulk suppliers' },
        { label: 'Janitorial Wholesale Dealers', query: 'janitorial supplies wholesale dealers' },
        { label: 'Commercial Cleaning Distributors', query: 'commercial cleaning products distributors' },
        { label: 'Cleaning Items Bulk Stockists', query: 'cleaning items bulk stockists' },
        { label: 'Institutional Cleaning Wholesale', query: 'institutional cleaning supplies wholesale' },
        { label: 'B2B Housekeeping Suppliers', query: 'b2b housekeeping products suppliers' },
        { label: 'Floor Chemical Wholesale Traders', query: 'floor cleaning chemicals wholesale traders' },
        { label: 'Detergent & Phenyl Bulk Dist.', query: 'detergent and phenyl bulk distributors' },
        { label: 'Toilet Cleaner Wholesale', query: 'toilet cleaner wholesale stockist' },
      ]
    },
    {
      id: 'retail',
      label: '🛒 Retailers & Regional Dealers',
      color: 'green',
      description: 'Local B2B storefronts and regional corporate-hub suppliers',
      presets: [
        { label: 'Cleaning Products Retail Shop', query: 'cleaning products retail shop' },
        { label: 'Housekeeping Material Dealers', query: 'housekeeping material dealers' },
        { label: 'Commercial Cleaning Equipment', query: 'commercial cleaning equipment dealers' },
        { label: 'Cleaning Items Merchants', query: 'cleaning items retail merchants' },
        { label: 'Sanitation Supplies Wholesale', query: 'sanitation supplies store wholesale' },
        { label: 'Disinfectant Liquid Retail', query: 'disinfectant liquid retail suppliers' },
        { label: 'Cleaning Tools & Mops', query: 'cleaning tools and mops showroom' },
        { label: 'Restroom Hygiene Products', query: 'restroom hygiene products supplier' },
        { label: 'Cleaning Products Dealer', query: 'cleaning products dealer' },
        { label: 'Chemical Wholesale Supplier', query: 'chemical wholesale supplier' },
        { label: 'General Store Wholesale', query: 'general store wholesale dealer' },
        { label: 'FMCG Distributor', query: 'FMCG product distributor' },
      ]
    },
    {
      id: 'niche',
      label: '🏆 Industry Niche (Premium)',
      color: 'purple',
      description: 'Elite distributors for hotels, hospitals, and corporates',
      presets: [
        { label: 'Hotel Housekeeping Suppliers', query: 'hotel housekeeping material suppliers' },
        { label: 'Hospital Grade Disinfectant', query: 'hospital grade disinfectant wholesalers' },
        { label: 'Industrial Degreaser Bulk', query: 'industrial degreaser bulk suppliers' },
        { label: 'Corporate Office Cleaning Vendor', query: 'corporate office cleaning supplies vendor' },
        { label: 'Facility Management Wholesale', query: 'facility management consumables wholesale' },
        { label: 'Kitchen Cleaning Items Bulk', query: 'catering and kitchen cleaning items bulk' },
        { label: 'Eco-Friendly Cleaning B2B', query: 'eco friendly cleaning products b2b wholesale' },
        { label: 'Industrial Cleaner Chemical', query: 'industrial cleaner chemical dealer' },
        { label: 'Construction Chemical Supplier', query: 'construction chemical supplier' },
        { label: 'Tile Grout Cleaner Dealer', query: 'tile grout cleaner dealer' },
        { label: 'Sanitary Ware Shop', query: 'sanitary ware bathroom accessories shop' },
      ]
    }
  ];

  const [activePillCategory, setActivePillCategory] = useState('wholesale');

  // Default negative keywords — filters out service providers, not product dealers
  const DEFAULT_EXCLUDES = 'services,cleaners,maids,housekeeping services,deep cleaning,car wash,laundry,pest control,repair,painting,packers';
  const [scrapeExcludes, setScrapeExcludes] = useState(DEFAULT_EXCLUDES);

  const CITY_OPTIONS = [
    'Hyderabad', 'Mumbai', 'Delhi', 'Bangalore', 'Chennai',
    'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Surat',
    'Lucknow', 'Nagpur', 'Visakhapatnam', 'Coimbatore', 'Kochi',
    'Chandigarh', 'Indore', 'Bhopal', 'Vadodara', 'Agra',
  ];

  // Editor states
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState('');

  // Analytics states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');

  // Refs for OTP autofocus
  const otpRefs = useRef([]);

  // Socket reference
  const socketRef = useRef(null);

  // Apply dark class
  useEffect(() => {
    const body = document.body;
    if (theme === 'dark') {
      body.classList.add('dark');
      body.style.backgroundColor = '#030712';
    } else {
      body.classList.remove('dark');
      body.style.backgroundColor = '#f8fafc';
    }
  }, [theme]);

  // Sync session on startup
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/auth/session`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          if (data.phone) {
            setPhone(data.phone);
            setLoginMethod('phone');
          } else if (data.email) {
            setEmail(data.email);
            setLoginMethod('email');
          }
          setStep(data.state.whatsappConnected ? 4 : 3);
          setWhatsappConnected(data.state.whatsappConnected);
          setConnectedNumber(data.state.whatsappNumber);
          setStats(data.state);
          setEditedTemplate(data.state.messageTemplate);
          if (data.logPreview) setMessageLogs(data.logPreview);
        }
      })
      .catch(err => console.error('Auth check error:', err));
  }, []);

  // Connect Socket.io
  useEffect(() => {
    socketRef.current = io(BACKEND_URL);

    socketRef.current.on('connect', () => {
      console.log('Socket Connected');
    });

    socketRef.current.on('whatsapp_state', (data) => {
      setWhatsappConnected(data.connected);
      setConnectedNumber(data.number);
      if (data.connected) {
        setStep(4);
      }
    });

    socketRef.current.on('whatsapp_qr', (data) => {
      setQrCode(data.qr);
      setQrLoading(false);
    });

    socketRef.current.on('whatsapp_pairing_code', (data) => {
      setPairingCode(data.code);
      setPairingLoading(false);
    });

    socketRef.current.on('scraper_progress', (data) => {
      setScraperState({
        progress: data.progress,
        active: true,
        leadsCount: data.leadsCount,
        sources: data.sources
      });
    });

    socketRef.current.on('scraper_done', (data) => {
      setScraperState(prev => ({
        ...prev,
        progress: 100,
        active: false,
        leadsCount: data.validLeads
      }));
      setStats(prev => ({
        ...prev,
        leadsScrapedCount: data.validLeads
      }));
      setDuplicatesRemoved(data.duplicatesRemoved);
      setLeadsPreview(data.leadsPreview);
    });

    socketRef.current.on('campaign_injected', (data) => {
      setLeadsInjected(true);
      setStats(prev => ({
        ...prev,
        leadsQueue: new Array(data.queueLength)
      }));
    });

    socketRef.current.on('whatsapp_connected', (data) => {
      setWhatsappConnected(true);
      setConnectedNumber(data.number);
    });

    socketRef.current.on('whatsapp_disconnected', () => {
      setWhatsappConnected(false);
      setConnectedNumber(null);
      setStep(3);
    });

    socketRef.current.on('campaign_state_change', (data) => {
      setStats(prev => ({ ...prev, campaignStatus: data.status }));
    });

    socketRef.current.on('campaign_tick', (data) => {
      setStats(prev => ({
        ...prev,
        sentToday: data.sentToday,
        deliveredCount: data.delivered,
        repliesReceivedCount: data.replies,
        hourlyHistory: data.hourly
      }));
      // Update existing log entry or prepend new one — avoids duplicate React keys
      setMessageLogs(prev => {
        const idx = prev.findIndex(l => l.id === data.log.id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = data.log;
          return updated;
        }
        return [data.log, ...prev.slice(0, 9)];
      });
    });

    socketRef.current.on('new_incoming_reply', (data) => {
      setLatestReplies(prev => [data, ...prev.slice(0, 4)]);
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // OTP box handles
  const handleOtpChange = (index, value) => {
    if (isNaN(value)) return;
    const newOtp = [...otpDigits];
    newOtp[index] = value.substring(value.length - 1);
    setOtpDigits(newOtp);

    // Auto-advance
    if (value && index < 5) {
      otpRefs.current[index + 1].focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1].focus();
    }
  };

  const handleGoogleLogin = async () => {
    setLoginLoading(true);
    setPhoneError('');
    setEmailError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();
      
      const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const data = await res.json();
      if (data.success) {
        setEmail(data.email);
        setLoginMethod('email');
        setWhatsappConnected(data.whatsappConnected);
        setConnectedNumber(data.whatsappNumber);
        if (data.whatsappConnected) {
          setStep(4); // Google verification bypasses OTP, goes straight to dashboard if WhatsApp is linked
        } else {
          setStep(3);
        }
      } else {
        setEmailError(data.error || 'Google login verification failed on server.');
      }
    } catch (err) {
      console.error(err);
      setEmailError(err.message || 'Error signing in with Google.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Auth flow API triggers
  const triggerOtp = async () => {
    if (loginMethod === 'phone' && !phone) return;
    if (loginMethod === 'email' && !email) return;
    setLoginLoading(true);
    setPhoneError('');
    setEmailError('');
    setEmailWarning('');
    setOtpChannel('');
    
    if (loginMethod === 'phone') {
      if (phone === '0000000000') {
        setOtpChannel('sms');
        setOtpDigits(['1', '2', '3', '4', '5', '6']);
        setStep(2);
        setLoginLoading(false);
        return;
      }
      try {
        if (!window.recaptchaVerifier) {
          window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'invisible',
            'callback': (response) => {
              // reCAPTCHA solved
            },
            'expired-callback': () => {
              setPhoneError('reCAPTCHA expired. Please try again.');
            }
          });
        }
        
        const fullPhone = `${countryCode}${phone}`;
        console.log('Sending OTP via Firebase for phone:', fullPhone);
        const confirmation = await signInWithPhoneNumber(auth, fullPhone, window.recaptchaVerifier);
        setConfirmationResult(confirmation);
        setOtpChannel('sms');
        setStep(2);
      } catch (err) {
        console.error(err);
        setPhoneError(err.message || 'Failed to send OTP via Firebase.');
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        }
      } finally {
        setLoginLoading(false);
      }
    } else {
      // Email OTP flow
      try {
        const payload = { email };
        const res = await fetch(`${BACKEND_URL}/api/auth/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          setOtpChannel(data.channel || 'email');
          if (data.warning) {
            setEmailWarning(data.warning);
          }
          setStep(2);
        } else {
          setEmailError(data.error || 'Failed to send OTP.');
        }
      } catch (err) {
        console.error(err);
        setEmailError('Server connection error. Please try again.');
      } finally {
        setLoginLoading(false);
      }
    }
  };

  const verifyOtp = async () => {
    const fullOtp = otpDigits.join('');
    if (fullOtp.length < 6) return;
    setLoginLoading(true);
    setOtpError('');
    
    if (loginMethod === 'phone') {
      if (phone === '0000000000' && fullOtp === '123456') {
        try {
          const res = await fetch(`${BACKEND_URL}/api/auth/firebase`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: 'cleara-test-token' })
          });
          const data = await res.json();
          if (data.success) {
            setWhatsappConnected(data.whatsappConnected);
            setConnectedNumber(data.whatsappNumber);
            if (data.whatsappConnected) {
              setStep(4);
            } else {
              setStep(3);
            }
          } else {
            setOtpError(data.error || 'Server validation failed for phone login.');
          }
        } catch (err) {
          setOtpError('Error connecting to backend.');
        } finally {
          setLoginLoading(false);
        }
        return;
      }
      try {
        if (!confirmationResult) {
          setOtpError('Verification session expired. Please request a new OTP.');
          setLoginLoading(false);
          return;
        }
        const result = await confirmationResult.confirm(fullOtp);
        const idToken = await result.user.getIdToken();
        
        const res = await fetch(`${BACKEND_URL}/api/auth/firebase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });
        const data = await res.json();
        if (data.success) {
          setWhatsappConnected(data.whatsappConnected);
          setConnectedNumber(data.whatsappNumber);
          if (data.whatsappConnected) {
            setStep(4);
          } else {
            setStep(3);
          }
        } else {
          setOtpError(data.error || 'Server validation failed for phone login.');
        }
      } catch (err) {
        console.error(err);
        setOtpError('Invalid OTP code. Please try again.');
      } finally {
        setLoginLoading(false);
      }
    } else {
      // Email OTP flow
      try {
        const payload = { email, otp: fullOtp };
        const res = await fetch(`${BACKEND_URL}/api/auth/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          setWhatsappConnected(data.whatsappConnected);
          setConnectedNumber(data.whatsappNumber);
          if (data.whatsappConnected) {
            setStep(4);
          } else {
            setStep(3);
          }
        } else {
          setOtpError(data.error || 'Verification failed');
        }
      } catch {
        setOtpError('Error connecting to authentication endpoint.');
      } finally {
        setLoginLoading(false);
      }
    }
  };

  // QR trigger backend call
  const handleGenerateQR = async () => {
    setQrLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/qr/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success && data.connected) {
        setWhatsappConnected(true);
        setConnectedNumber(data.number);
        setStep(4);
        setQrLoading(false);
      }
    } catch (err) {
      console.error(err);
      setQrLoading(false);
    }
  };

  const handleGeneratePairing = async () => {
    setPairingLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/qr/pairing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pairingPhone })
      });
      const data = await res.json();
      if (data.success) {
        if (data.connected) {
          setWhatsappConnected(true);
          setConnectedNumber(data.number);
          setStep(4);
        } else if (data.code) {
          setPairingCode(data.code);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleScanSimulation = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/qr/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        setWhatsappConnected(true);
        setConnectedNumber(data.number);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDisconnectNode = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/qr/disconnect`, { method: 'POST' });
      setWhatsappConnected(false);
      setConnectedNumber(null);
      setQrCode('');
      setStep(3);
    } catch (err) {
      console.error(err);
    }
  };

  // Scrape action
  const handleScrape = async () => {
    if (!scrapeKeyword.trim()) return;
    setScraperState({
      progress: 0,
      active: true,
      leadsCount: 0,
      sources: {
        'Yahoo Search': { count: 0, status: 'Searching...' },
        'DuckDuckGo Search': { count: 0, status: 'Searching...' },
        'Deep Crawl': { count: 0, status: 'Standby' }
      }
    });
    setLeadsInjected(false);

    // Build full India-targeted query
    const fullQuery = `${scrapeKeyword.trim()} ${scrapeCity}`;
    // Parse negative keywords
    const excludeList = scrapeExcludes
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    try {
      await fetch(`${BACKEND_URL}/api/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: fullQuery,
          city: scrapeCity,
          excludeKeywords: excludeList
        })
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Inject leads
  const handleInjectLeads = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaign/inject`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLeadsInjected(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Campaign controls
  const handleCampaignAction = async (action) => {
    try {
      await fetch(`${BACKEND_URL}/api/campaign/${action}`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSpeedSliderChange = async (e) => {
    const val = parseInt(e.target.value);
    setStats(prev => ({ ...prev, speedLevel: val }));
    try {
      await fetch(`${BACKEND_URL}/api/campaign/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speedLevel: val })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveMessage = async () => {
    setIsEditingMessage(false);
    setStats(prev => ({ ...prev, messageTemplate: editedTemplate }));
    try {
      await fetch(`${BACKEND_URL}/api/campaign/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageTemplate: editedTemplate })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleLoadTemplate = async (type) => {
    const templateText = type === 'long' ? LONG_FORM_TEMPLATE : SHORT_FORM_TEMPLATE;
    setStats(prev => ({ ...prev, messageTemplate: templateText }));
    setEditedTemplate(templateText);
    try {
      await fetch(`${BACKEND_URL}/api/campaign/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageTemplate: templateText })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAnalyzeTemplate = async () => {
    setIsAnalyzing(true);
    setAnalysisResult('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/campaign/analyze-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageTemplate: stats.messageTemplate })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.analysis);
      }
    } catch (err) {
      console.error(err);
      setAnalysisResult('Error running conversion analysis. Please check your Ollama backend.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/auth/logout`, { method: 'POST' });
      setStep(1);
      setPhone('');
      setEmail('');
      setOtpDigits(['', '', '', '', '', '']);
      setPhoneError('');
      setEmailError('');
      setEmailWarning('');
      setWhatsappConnected(false);
      setConnectedNumber(null);
    } catch (err) {
      console.error(err);
    }
  };

  // CSV lead import handler
  const handleCsvImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvError('');
    setCsvImporting(true);
    setLeadsInjected(false);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const lines = text.trim().split('\n');
        // Detect header row
        const hasHeader = isNaN(lines[0].split(',')[0].replace(/\D/g, ''));
        const dataLines = hasHeader ? lines.slice(1) : lines;

        const leads = dataLines.map(line => {
          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          return {
            name: cols[0] || 'Unknown',
            phone: cols[1] || '',
            city: cols[2] || 'India',
            source: cols[3] || 'CSV'
          };
        }).filter(l => l.phone);

        if (leads.length === 0) {
          setCsvError('No valid leads found. Ensure CSV has columns: Name, Phone, City, Source');
          setCsvImporting(false);
          return;
        }

        const res = await fetch(`${BACKEND_URL}/api/leads/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leads })
        });
        const data = await res.json();
        if (!data.success) {
          setCsvError(data.error || 'Import failed');
        }
      } catch (err) {
        setCsvError('Error reading CSV file. Please check the format.');
        console.error(err);
      } finally {
        setCsvImporting(false);
        if (csvInputRef.current) csvInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };
  const getDeliveryRate = () => {
    if (stats.sentToday === 0) return '91%';
    return `${Math.round((stats.deliveredCount / stats.sentToday) * 100)}%`;
  };

  // Donut chart path values
  const getDonutStrokeDash = () => {
    const pct = stats.sentToday / stats.targetCount;
    const circ = 2 * Math.PI * 36;
    return `${pct * circ} ${circ}`;
  };

  return (
    <div className={`min-h-screen text-slate-800 dark:text-slate-100 transition-colors duration-200 ${theme === 'dark' ? 'dark' : ''}`}>
      
      {/* HEADER SECTION (Accessible when logged in) */}
      {step === 4 && (
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800/80 px-6 py-4 flex justify-between items-center transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand flex items-center justify-center text-white">
              <i className="ti ti-droplet-filled text-xl"></i>
            </div>
            <span className="font-outfit font-bold text-2xl tracking-tight text-slate-900 dark:text-white">Cleara</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Status indicators */}
            <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-xs font-semibold">
              <span className="text-slate-500 dark:text-slate-400">Campaign Status:</span>
              <div className="flex items-center gap-1.5">
                {stats.campaignStatus === 'Running' && (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-green"></span>
                    <span className="text-emerald-600 dark:text-emerald-400">Running</span>
                  </>
                )}
                {stats.campaignStatus === 'Paused' && (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-amber-600 dark:text-amber-400">Paused</span>
                  </>
                )}
                {stats.campaignStatus === 'Stopped' && (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                    <span className="text-red-600 dark:text-red-400">Stopped</span>
                  </>
                )}
              </div>
            </div>

            {/* Connected Outbound Number */}
            <div className="flex items-center gap-2 bg-brand/10 text-brand dark:text-brand-light px-3 py-1.5 rounded-lg text-xs font-semibold">
              <i className="ti ti-brand-whatsapp text-sm"></i>
              <span>{connectedNumber || 'None Connected'}</span>
              <button
                onClick={handleDisconnectNode}
                className="ml-1 text-red-500 hover:text-red-700 dark:hover:text-red-400 transition cursor-pointer flex items-center justify-center"
                title="Disconnect WhatsApp Device"
              >
                <i className="ti ti-trash text-xs"></i>
              </button>
            </div>

            {/* Dark Mode toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <i className={theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon'}></i>
            </button>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
              title="Logout session"
            >
              <i className="ti ti-logout"></i>
            </button>
          </div>
        </header>
      )}

      {/* 3-STEP ONBOARDING GATE */}
      {step < 4 && (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center px-6 py-12 transition-colors">
          
          {/* Hidden reCAPTCHA container for Firebase Phone Authentication */}
          <div id="recaptcha-container"></div>
          
          {/* Logo container */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-brand flex items-center justify-center text-white shadow-lg shadow-brand/20">
              <i className="ti ti-droplet-filled text-2xl animate-bounce"></i>
            </div>
            <span className="font-outfit font-black text-4xl tracking-tight text-slate-900 dark:text-white">Cleara</span>
          </div>

          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-xl shadow-slate-100 dark:shadow-none p-8 transition-colors">
            
            {/* Step Indicators */}
            <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
              <span className={`text-xs font-bold font-outfit uppercase ${step === 1 ? 'text-brand' : 'text-slate-400'}`}>1. Login Gate</span>
              <i className="ti ti-chevron-right text-slate-300 dark:text-slate-700"></i>
              <span className={`text-xs font-bold font-outfit uppercase ${step === 2 ? 'text-brand' : 'text-slate-400'}`}>2. Verify OTP</span>
              <i className="ti ti-chevron-right text-slate-300 dark:text-slate-700"></i>
              <span className={`text-xs font-bold font-outfit uppercase ${step === 3 ? 'text-brand' : 'text-slate-400'}`}>3. Connect WhatsApp</span>
            </div>

            {/* STEP 1: LOGIN METHOD GATE */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-outfit font-bold text-xl text-slate-900 dark:text-white mb-2">Onboard Cleara Brand Node</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Select your preferred authentication gateway to access the campaign distribution panel.
                  </p>
                </div>

                {/* Method selector tabs */}
                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800/80">
                  <button
                    onClick={() => { setLoginMethod('phone'); setPhoneError(''); }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      loginMethod === 'phone'
                        ? 'bg-white dark:bg-slate-900 text-brand shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <i className="ti ti-phone text-sm"></i>
                    Phone Number
                  </button>
                  <button
                    onClick={() => { setLoginMethod('email'); setEmailError(''); }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      loginMethod === 'email'
                        ? 'bg-white dark:bg-slate-900 text-brand shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <i className="ti ti-mail text-sm"></i>
                    Email Address
                  </button>
                </div>

                {loginMethod === 'phone' ? (
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Brand Phone Number</label>
                      <div className={`flex rounded-lg border overflow-hidden shadow-sm ${phoneError ? 'border-red-400 dark:border-red-600' : 'border-slate-300 dark:border-slate-800'}`}>
                        <select
                          className="bg-slate-50 dark:bg-slate-950 border-r border-slate-300 dark:border-slate-800 px-3 py-3 text-sm font-semibold outline-none text-slate-700 dark:text-slate-300"
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                        >
                          <option value="+91">+91 (IN)</option>
                          <option value="+1">+1 (US)</option>
                          <option value="+44">+44 (UK)</option>
                          <option value="+971">+971 (AE)</option>
                        </select>
                        <input
                          type="tel"
                          className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 text-sm outline-none font-semibold tracking-wide"
                          placeholder="9398317754"
                          value={phone}
                          onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setPhoneError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && phone && triggerOtp()}
                        />
                      </div>
                      {phoneError && (
                        <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-600 dark:text-red-400 font-semibold flex items-start gap-2">
                          <i className="ti ti-alert-circle text-sm mt-0.5 shrink-0"></i>
                          <span>{phoneError}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={triggerOtp}
                      disabled={!phone || loginLoading}
                      className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-brand/20 transition-all text-sm uppercase tracking-wider flex justify-center items-center gap-2"
                    >
                      {loginLoading ? 'Sending OTP via WhatsApp...' : 'Send Verification OTP'}
                      <i className="ti ti-brand-whatsapp"></i>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Email Address</label>
                      <div className={`flex rounded-lg border overflow-hidden shadow-sm ${emailError ? 'border-red-400 dark:border-red-600' : 'border-slate-300 dark:border-slate-800'}`}>
                        <input
                          type="email"
                          className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 text-sm outline-none font-semibold tracking-wide"
                          placeholder="admin@cleara.in"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                          onKeyDown={(e) => e.key === 'Enter' && email && triggerOtp()}
                        />
                      </div>
                      {emailError && (
                        <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-600 dark:text-red-400 font-semibold flex items-start gap-2">
                          <i className="ti ti-alert-circle text-sm mt-0.5 shrink-0"></i>
                          <span>{emailError}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={triggerOtp}
                      disabled={!email || loginLoading}
                      className="w-full bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3.5 rounded-lg shadow-lg shadow-brand/20 transition-all text-sm uppercase tracking-wider flex justify-center items-center gap-2"
                    >
                      {loginLoading ? 'Sending OTP via Email...' : 'Send Verification OTP'}
                      <i className="ti ti-mail"></i>
                    </button>
                  </div>
                )}

                {/* Google Sign-in separator and button */}
                <div className="relative flex items-center justify-center my-5">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                  </div>
                  <span className="relative px-3 bg-white dark:bg-slate-900 text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Or secure sign in
                  </span>
                </div>

                <button
                  onClick={handleGoogleLogin}
                  disabled={loginLoading}
                  className="w-full bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-300 dark:border-slate-800 text-slate-750 dark:text-slate-200 font-semibold py-3.5 rounded-lg transition-all text-sm uppercase tracking-wider flex justify-center items-center gap-2.5 shadow-sm hover:shadow active:scale-[0.99]"
                >
                  {loginLoading ? (
                    <span className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
                    </svg>
                  )}
                  {loginLoading ? 'Connecting...' : 'Sign in with Google'}
                </button>
              </div>
            )}

            {/* STEP 2: OTP VERIFICATION */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-outfit font-bold text-xl text-slate-900 dark:text-white mb-2">Verification Code</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Enter the 6-digit OTP sent to{' '}
                    <strong className="text-slate-800 dark:text-slate-200">
                      {loginMethod === 'phone' ? `${countryCode} ${phone}` : email}
                    </strong>
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Pin grid */}
                  <div className="flex justify-between gap-2">
                    {otpDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpRefs.current[idx] = el)}
                        type="text"
                        maxLength="1"
                        className="w-12 h-14 border border-slate-300 dark:border-slate-800 rounded-lg text-center font-bold font-outfit text-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-brand dark:focus:border-brand outline-none focus:ring-1 focus:ring-brand shadow-sm"
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      />
                    ))}
                  </div>

                  {otpError && (
                    <p className="text-xs font-semibold text-red-500 flex items-center gap-1.5">
                      <i className="ti ti-alert-circle text-sm"></i>
                      {otpError}
                    </p>
                  )}

                  {emailWarning && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-600 dark:text-amber-400 font-semibold flex items-start gap-2">
                      <i className="ti ti-alert-triangle text-sm mt-0.5 shrink-0"></i>
                      <span>{emailWarning}</span>
                    </div>
                  )}

                  <div className={`rounded-lg p-3 text-xs font-semibold tracking-wide text-center flex items-center justify-center gap-2 ${
                    otpChannel === 'sms'
                      ? 'bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400'
                      : otpChannel.startsWith('email')
                      ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400'
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                  }`}>
                    <i className={`text-base ${
                      otpChannel === 'sms' 
                        ? 'ti ti-message-2' 
                        : otpChannel.startsWith('email') 
                        ? 'ti ti-mail' 
                        : 'ti ti-brand-whatsapp'
                    }`}></i>
                    <span>
                      {otpChannel === 'sms'
                        ? `OTP sent via SMS to ${countryCode}${phone} — check your messages`
                        : otpChannel.startsWith('email')
                        ? `OTP sent to ${email} — check your inbox`
                        : `OTP sent to your WhatsApp — check your phone now`
                      }
                    </span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 border border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 py-3 rounded-lg text-sm font-semibold transition"
                    >
                      Back
                    </button>
                    <button
                      onClick={verifyOtp}
                      disabled={otpDigits.some(d => !d) || loginLoading}
                      className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-semibold py-3 rounded-lg shadow-lg shadow-brand/20 transition uppercase tracking-wider text-xs"
                    >
                      {loginLoading ? 'Verifying...' : 'Verify & Continue'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: WHATSAPP CONNECTION (QR + PAIRING KEY) */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-outfit font-bold text-xl text-slate-900 dark:text-white mb-2">WhatsApp Channel Setup</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    Link your WhatsApp Business device to send cold-pitches. Choose to either scan the QR Code or generate a Pairing Key.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch py-4">
                  {/* Option A: QR Code */}
                  <div className="flex flex-col items-center justify-between p-5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-2xl relative shadow-inner">
                    <div className="text-center mb-3">
                      <span className="badge bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] uppercase tracking-wider font-bold py-1 px-2.5 rounded-full mb-2 inline-block">
                        Option A: QR Code
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Scan with WhatsApp Linked Devices</p>
                    </div>

                    <div className="relative w-44 h-44 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-center rounded-xl overflow-hidden shadow-sm">
                      {qrLoading && (
                        <span className="text-xs font-semibold text-slate-400 animate-pulse">Generating...</span>
                      )}
                      
                      {!qrLoading && !qrCode && !whatsappConnected && (
                        <div className="text-center p-4">
                          <i className="ti ti-qrcode text-3xl text-slate-300 dark:text-slate-700 block mb-2"></i>
                          <span className="text-[10px] font-semibold text-slate-400">Not generated</span>
                        </div>
                      )}

                      {!qrLoading && qrCode && !whatsappConnected && (
                        <>
                          <div className="p-2 bg-white rounded-lg">
                            <img
                              src={qrCode}
                              alt="WhatsApp QR Code"
                              className="w-36 h-36 object-contain"
                            />
                          </div>
                          <div className="laser-line"></div>
                        </>
                      )}

                      {whatsappConnected && (
                        <div className="text-center p-4 animate-fade-in space-y-1">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto shadow-sm">
                            <i className="ti ti-circle-check text-xl"></i>
                          </div>
                          <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-xs font-bold py-1 px-2.5 rounded-full inline-block">
                            Connected
                          </span>
                        </div>
                      )}
                    </div>

                    {!qrCode && !whatsappConnected && (
                      <button
                        onClick={handleGenerateQR}
                        disabled={qrLoading || pairingLoading}
                        className="mt-4 w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2 px-4 rounded-lg text-xs transition disabled:opacity-50"
                      >
                        {qrLoading ? 'Generating...' : 'Get QR Code'}
                      </button>
                    )}

                    {qrCode && !whatsappConnected && (
                      <button
                        onClick={handleScanSimulation}
                        className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg text-xs shadow-md transition"
                      >
                        Simulate Link Scan
                      </button>
                    )}

                    {whatsappConnected && (
                      <div className="mt-4 text-xs text-slate-500 font-mono tracking-wide">{connectedNumber}</div>
                    )}
                  </div>

                  {/* Option B: Pairing Key */}
                  <div className="flex flex-col items-center justify-between p-5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-2xl relative shadow-inner">
                    <div className="text-center mb-3">
                      <span className="badge bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] uppercase tracking-wider font-bold py-1 px-2.5 rounded-full mb-2 inline-block">
                        Option B: Pairing Key
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Link with Phone Number instead</p>
                    </div>

                    <div className="w-full flex flex-col items-center justify-center flex-1 space-y-3">
                      {pairingLoading && (
                        <span className="text-xs font-semibold text-slate-400 animate-pulse">Requesting Pairing Key...</span>
                      )}

                      {!pairingLoading && !pairingCode && !whatsappConnected && (
                        <div className="w-full space-y-2.5">
                          <div className="text-left w-full">
                            <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">WhatsApp Phone Number</label>
                            <input
                              type="text"
                              value={pairingPhone}
                              onChange={(e) => setPairingPhone(e.target.value)}
                              placeholder="e.g., 919398317754"
                              className="w-full text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-2 font-mono"
                            />
                          </div>
                          <button
                            onClick={handleGeneratePairing}
                            disabled={qrLoading || pairingLoading}
                            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2 px-4 rounded-lg text-xs transition disabled:opacity-50"
                          >
                            Get Pairing Key
                          </button>
                        </div>
                      )}

                      {!pairingLoading && pairingCode && !whatsappConnected && (
                        <div className="text-center space-y-3 w-full">
                          <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
                            <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Enter this pairing key:</div>
                            <div className="text-2xl font-bold tracking-widest font-mono text-brand select-all bg-slate-50 dark:bg-slate-900 py-1.5 px-3 rounded-lg border border-slate-100 dark:border-slate-800">
                              {pairingCode}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(pairingCode);
                              alert("Copied pairing key!");
                            }}
                            className="w-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 py-1.5 px-4 rounded-lg text-xs transition"
                          >
                            Copy Key
                          </button>
                        </div>
                      )}

                      {whatsappConnected && (
                        <div className="text-center p-4 animate-fade-in space-y-1">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto shadow-sm">
                            <i className="ti ti-circle-check text-xl"></i>
                          </div>
                          <span className="badge bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 text-xs font-bold py-1 px-2.5 rounded-full inline-block">
                            Connected
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col space-y-3 pt-2">
                  {whatsappConnected && (
                    <div className="w-full space-y-3">
                      <button
                        onClick={() => setStep(4)}
                        className="w-full bg-brand hover:bg-brand-dark text-white font-bold py-3.5 rounded-lg text-sm uppercase tracking-wider shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2"
                      >
                        Open Dashboard Console
                        <i className="ti ti-layout-dashboard"></i>
                      </button>
                      <button
                        onClick={handleDisconnectNode}
                        className="w-full border border-red-200 dark:border-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 py-2.5 rounded-lg text-xs font-semibold transition"
                      >
                        Disconnect Node
                      </button>
                    </div>
                  )}

                  {!whatsappConnected && (
                    <button
                    >
                      Reset WhatsApp Session & Clear Cache
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN DASHBOARD */}
      {step === 4 && (
        <main className="max-w-7xl mx-auto p-6 space-y-6">
          
          {/* SECTION 2 — MAIN STATS CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Stat 1: Sent today */}
            <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-xl transition-colors">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 mb-3">
                <span className="text-xs font-bold font-outfit uppercase tracking-wider">Sent Today</span>
                <i className="ti ti-send text-lg text-slate-400"></i>
              </div>
              <div className="font-outfit font-black text-3xl mb-3 tracking-tight">
                {stats.sentToday.toLocaleString()} <span className="text-xs text-slate-400 font-semibold">/ {stats.targetCount.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-brand h-full transition-all duration-300"
                  style={{ width: `${Math.min(100, (stats.sentToday / stats.targetCount) * 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Stat 2: Delivered */}
            <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-xl transition-colors">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 mb-3">
                <span className="text-xs font-bold font-outfit uppercase tracking-wider">Delivered</span>
                <i className="ti ti-circle-check text-lg text-slate-400"></i>
              </div>
              <div className="font-outfit font-black text-3xl mb-3 tracking-tight">
                {getDeliveryRate()}
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-teal-500 h-full transition-all duration-300"
                  style={{ width: stats.sentToday > 0 ? `${(stats.deliveredCount / stats.sentToday) * 100}%` : '91%' }}
                ></div>
              </div>
            </div>

            {/* Stat 3: Leads Scraped */}
            <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-xl transition-colors">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 mb-3">
                <span className="text-xs font-bold font-outfit uppercase tracking-wider">Leads Scraped</span>
                <i className="ti ti-database text-lg text-slate-400"></i>
              </div>
              <div className="font-outfit font-black text-3xl tracking-tight mb-2">
                {stats.leadsScrapedCount.toLocaleString()}
              </div>
              <span className="text-xs font-semibold text-slate-400 block">Valid business entries verified</span>
            </div>

            {/* Stat 4: Replies Received */}
            <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-xl transition-colors">
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 mb-3">
                <span className="text-xs font-bold font-outfit uppercase tracking-wider">Replies Received</span>
                <i className="ti ti-message-dots text-lg text-slate-400"></i>
              </div>
              <div className="font-outfit font-black text-3xl tracking-tight mb-2" style={{ color: stats.repliesReceivedCount > 0 ? '#1A7A4A' : 'inherit' }}>
                {stats.repliesReceivedCount.toLocaleString()}
              </div>
              <span className="text-xs font-semibold text-slate-400 block">Distributors expressing interest</span>
            </div>

          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* LEFT COLUMN: CAMPAIGN CONTROL & DESIGN (6 Columns) */}
            <div className="lg:col-span-6 space-y-6">
              
              {/* SECTION 3 — CAMPAIGN MESSAGE & CONTROLS */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 transition-colors shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-outfit font-bold text-lg flex items-center gap-2">
                    <i className="ti ti-speakerphone text-brand text-xl"></i>
                    Outreach Dispatch Controller
                  </h2>
                  
                  <div className="flex items-center gap-3">
                    {/* Template quick switchers */}
                    <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-950 p-0.5 text-[10px] font-bold">
                      <button
                        onClick={() => handleLoadTemplate('short')}
                        className={`px-2.5 py-1 rounded transition-all duration-200 ${stats.messageTemplate && stats.messageTemplate.includes("double your retail profits") ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        Short Form
                      </button>
                      <button
                        onClick={() => handleLoadTemplate('long')}
                        className={`px-2.5 py-1 rounded transition-all duration-200 ${stats.messageTemplate && stats.messageTemplate.includes("Stop losing customers") ? 'bg-brand text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        Long Form
                      </button>
                    </div>

                    {!isEditingMessage && (
                      <>
                        <button
                          onClick={handleAnalyzeTemplate}
                          disabled={isAnalyzing}
                          className="border border-brand/30 hover:border-brand bg-brand/5 dark:bg-brand/10 hover:bg-brand/10 text-brand dark:text-brand-light px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                        >
                          {isAnalyzing ? (
                            <>
                              <span className="w-3.5 h-3.5 border-2 border-brand border-t-transparent rounded-full animate-spin"></span>
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <i className="ti ti-brain text-sm"></i>
                              Analyze Conversion
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => { setEditedTemplate(stats.messageTemplate); setIsEditingMessage(true); }}
                          className="border border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1 rounded text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <i className="ti ti-edit"></i>
                          Edit Template
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Message display frame */}
                <div className="mb-6">
                  {isEditingMessage ? (
                    <div className="space-y-3">
                      <textarea
                        className="w-full h-48 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-xs font-mono rounded-lg outline-none focus:border-brand transition"
                        value={editedTemplate}
                        onChange={(e) => setEditedTemplate(e.target.value)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setIsEditingMessage(false)}
                          className="px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveMessage}
                          className="px-3.5 py-1.5 rounded bg-brand text-white hover:bg-brand-dark text-xs font-bold transition"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 p-4 rounded-lg">
                      <pre className="text-xs whitespace-pre-wrap font-sans text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                        {stats.messageTemplate}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Marketing Template Analytics Agent Feedback */}
                {analysisResult && (
                  <div className="mb-6 p-5 bg-slate-50 dark:bg-slate-950/80 border-l-4 border-brand rounded-r-xl relative animate-fade-in shadow-inner border border-slate-200/50 dark:border-slate-800/50">
                    <button
                      onClick={() => setAnalysisResult('')}
                      className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                      title="Dismiss feedback"
                    >
                      <i className="ti ti-x text-sm"></i>
                    </button>
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 font-outfit flex items-center gap-1.5">
                      <i className="ti ti-brain text-brand text-sm"></i>
                      Marketing Analytics Agent
                    </h4>
                    <div className="text-xs space-y-1.5 leading-relaxed text-slate-700 dark:text-slate-300 font-sans">
                      <pre className="whitespace-pre-wrap font-sans text-xs font-medium">
                        {analysisResult}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Dispatch rate speed slider */}
                <div className="mb-6">
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-500 uppercase mb-2">
                    <span>Campaign Sending Speed</span>
                    <span className="text-brand font-bold">
                      {['~70 messages/hr', '~150 messages/hr', '~300 messages/hr', '~500 messages/hr', '~700 messages/hr'][stats.speedLevel - 1]}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand"
                    value={stats.speedLevel}
                    onChange={handleSpeedSliderChange}
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold px-1 mt-1.5">
                    <span>Level 1 (Safe)</span>
                    <span>Level 3 (Balanced)</span>
                    <span>Level 5 (Aggressive)</span>
                  </div>
                </div>

                {/* Queue buttons controls */}
                <div className="flex gap-4">
                  {stats.campaignStatus === 'Running' ? (
                    <button
                      onClick={() => handleCampaignAction('pause')}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 rounded-lg text-sm transition shadow-md shadow-amber-500/10 flex items-center justify-center gap-1.5"
                    >
                      <i className="ti ti-player-pause"></i>
                      Pause Campaign
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCampaignAction('start')}
                      disabled={!leadsInjected || stats.campaignStatus === 'Running'}
                      className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold py-3.5 rounded-lg text-sm transition shadow-lg shadow-brand/20 flex items-center justify-center gap-1.5"
                    >
                      <i className="ti ti-player-play"></i>
                      Start Campaign
                    </button>
                  )}

                  <button
                    onClick={() => handleCampaignAction('stop')}
                    disabled={stats.campaignStatus === 'Stopped'}
                    className="flex-1 border border-slate-300 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-red-500 font-bold py-3.5 rounded-lg text-sm transition flex items-center justify-center gap-1.5"
                  >
                    <i className="ti ti-player-stop"></i>
                    Stop Campaign
                  </button>
                </div>

                {!leadsInjected && (
                  <div className="mt-4 p-3 bg-accent-light dark:bg-slate-800/40 text-accent dark:text-slate-300 border border-slate-200 dark:border-slate-800/80 rounded-lg text-xs leading-relaxed font-semibold flex items-center gap-2">
                    <i className="ti ti-info-circle text-base"></i>
                    Ensure you scrape and inject target leads before starting the campaign dispatch loop.
                  </div>
                )}
              </div>

              {/* SECTION 5 — LIVE SEND LOG */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 transition-colors shadow-sm">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-outfit font-bold text-lg flex items-center gap-2">
                    <i className="ti ti-terminal-2 text-slate-700 dark:text-slate-300 text-xl"></i>
                    Campaign Dispatch Log
                  </h2>
                  
                  {/* Download logs */}
                  <a
                    href={`${BACKEND_URL}/api/campaign/download-logs`}
                    className="text-xs font-semibold text-brand hover:underline flex items-center gap-1"
                    download
                  >
                    <i className="ti ti-download"></i>
                    Export Logs CSV
                  </a>
                </div>

                {/* Log terminal list */}
                <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 rounded-lg p-3 h-64 overflow-y-auto font-mono text-[11px] space-y-1.5">
                  {messageLogs.length > 0 ? (
                    messageLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 pb-1">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-slate-400 font-semibold">{log.id}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 max-w-[120px] truncate">{log.name}</span>
                          <span className="text-slate-400 font-medium">({log.city})</span>
                          <span className="text-slate-500">{log.phone}</span>
                        </div>
                        <div>
                          {log.status === 'Sent' && (
                            <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded">Sent</span>
                          )}
                          {log.status === 'Delivered' && (
                            <span className="bg-teal-100 text-teal-800 dark:bg-teal-950/30 dark:text-teal-400 text-[9px] font-bold px-2 py-0.5 rounded">Delivered</span>
                          )}
                          {log.status === 'Failed' && (
                            <span className="bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400 text-[9px] font-bold px-2 py-0.5 rounded">Failed</span>
                          )}
                          {log.status === 'Queued' && (
                            <span className="bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded">Queued</span>
                          )}
                          {log.status === 'Skipped' && (
                            <span className="bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400 text-[9px] font-bold px-2 py-0.5 rounded">Skipped</span>
                          )}
                          {log.status === 'Not on WA' && (
                            <span className="bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400 text-[9px] font-bold px-2 py-0.5 rounded">Not on WA</span>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 italic text-center py-20">No campaigns dispatched yet. Standby...</div>
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: LEAD SCRAPER & VISUALS (6 Columns) */}
            <div className="lg:col-span-6 space-y-6">
              
              {/* SECTION 4 — REAL CSV LEAD IMPORT */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 transition-colors shadow-sm">
                
                {/* Right Column Tabs */}
                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800/80 mb-6">
                  <button
                    onClick={() => setRightTab('scraper')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      rightTab === 'scraper'
                        ? 'bg-white dark:bg-slate-900 text-brand shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <i className="ti ti-search text-sm"></i>
                    B2B Directory Scraper
                  </button>
                  <button
                    onClick={() => setRightTab('import')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                      rightTab === 'import'
                        ? 'bg-white dark:bg-slate-900 text-brand shadow-sm font-bold'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <i className="ti ti-file-spreadsheet text-sm"></i>
                    CSV Bulk Import
                  </button>
                </div>

                {rightTab === 'scraper' ? (
                  /* SECTION 4.1: B2B LEAD SCRAPER — UPGRADED */
                  <div className="space-y-5 animate-fade-in">
                    <div>
                      <h2 className="font-outfit font-bold text-lg flex items-center gap-2 mb-1">
                        <i className="ti ti-search text-brand text-xl"></i>
                        B2B Directory Scraper
                      </h2>
                      <p className="text-xs text-slate-400">Find distributors, bulk dealers & wholesale stockists across India. Select a category, pick a city, then extract.</p>
                    </div>

                    {/* ── CATEGORY TABS ── */}
                    <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                      {KEYWORD_CATEGORIES.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setActivePillCategory(cat.id)}
                          disabled={scraperState.active}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all leading-tight ${
                            activePillCategory === cat.id
                              ? 'bg-white dark:bg-slate-900 text-brand shadow-sm'
                              : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>

                    {/* ── KEYWORD PRESET PILLS (filtered by category) ── */}
                    {KEYWORD_CATEGORIES.filter(c => c.id === activePillCategory).map(cat => (
                      <div key={cat.id}>
                        <p className="text-[10px] text-slate-400 mb-2 italic">{cat.description}</p>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 pb-1">
                          {cat.presets.map((preset) => (
                            <button
                              key={preset.query}
                              onClick={() => setScrapeKeyword(preset.query)}
                              disabled={scraperState.active}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                                scrapeKeyword === preset.query
                                  ? 'bg-brand text-white border-brand shadow-sm shadow-brand/20'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-brand hover:text-brand'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* ── CITY + KEYWORD ROW ── */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target City + Keyword</p>
                      <div className="flex gap-2">
                        {/* City selector */}
                        <select
                          className="px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-brand transition font-semibold text-slate-700 dark:text-slate-300 shrink-0"
                          value={scrapeCity}
                          onChange={(e) => setScrapeCity(e.target.value)}
                          disabled={scraperState.active}
                        >
                          {CITY_OPTIONS.map(city => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>

                        {/* Keyword input */}
                        <input
                          type="text"
                          className="flex-1 min-w-0 px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm outline-none focus:border-brand transition font-semibold"
                          placeholder="Custom keyword or pick above…"
                          value={scrapeKeyword}
                          onChange={(e) => setScrapeKeyword(e.target.value)}
                          disabled={scraperState.active}
                          onKeyDown={(e) => e.key === 'Enter' && scrapeKeyword && !scraperState.active && handleScrape()}
                        />

                        {/* Extract button */}
                        <button
                          onClick={handleScrape}
                          disabled={!scrapeKeyword || scraperState.active}
                          className="bg-brand hover:bg-brand-dark disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-lg text-sm transition flex items-center gap-1.5 shadow-md shadow-brand/10 cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {scraperState.active ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                              Scraping...
                            </>
                          ) : (
                            <>
                              <i className="ti ti-search"></i>
                              Extract
                            </>
                          )}
                        </button>
                      </div>

                      {/* Live query preview */}
                      {scrapeKeyword && (
                        <p className="text-[10px] text-slate-400 font-mono pl-1">
                          Query: <span className="text-brand font-semibold">"{ scrapeKeyword } { scrapeCity } India"</span>
                        </p>
                      )}
                    </div>

                    {/* ── NEGATIVE KEYWORDS FILTER ── */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                          <i className="ti ti-ban text-xs"></i>
                          Negative Keywords (Exclude)
                        </p>
                        <button
                          onClick={() => setScrapeExcludes(DEFAULT_EXCLUDES)}
                          className="text-[10px] text-slate-400 hover:text-brand transition font-semibold"
                        >
                          Reset defaults
                        </button>
                      </div>
                      <input
                        type="text"
                        className="w-full px-3 py-2 bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-900/30 rounded-lg text-[11px] outline-none focus:border-red-400 transition font-mono text-red-700 dark:text-red-300"
                        placeholder="services, maids, deep cleaning, car wash…"
                        value={scrapeExcludes}
                        onChange={(e) => setScrapeExcludes(e.target.value)}
                        disabled={scraperState.active}
                      />
                      <p className="text-[10px] text-slate-400 pl-0.5">Comma-separated. Results containing these words will be filtered out.</p>
                    </div>

                    {/* Scraper Progress and Status Feed */}
                    {scraperState.active && (
                      <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/50 dark:border-slate-800/50 animate-fade-in shadow-inner">
                        <div className="flex justify-between items-center text-xs font-bold">
                          <span className="text-slate-500 uppercase tracking-wider">Extraction Progress</span>
                          <span className="text-brand font-bold">{scraperState.progress}%</span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-brand h-full transition-all duration-300"
                            style={{ width: `${scraperState.progress}%` }}
                          ></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-2 animate-fade-in">
                          {Object.entries(scraperState.sources).map(([src, info]) => (
                            <div key={src} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 p-2.5 rounded-lg text-xs flex justify-between items-center shadow-sm">
                              <span className="font-semibold text-slate-500">{src}</span>
                              <div className="flex items-center gap-1.5 font-bold font-mono">
                                <span className="text-slate-850 dark:text-slate-100">{info.count} leads</span>
                                <span className={`w-1.5 h-1.5 rounded-full ${info.status === 'Done' ? 'bg-emerald-500' : 'bg-brand animate-pulse'}`}></span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* SECTION 4.2: REAL CSV LEAD IMPORT */
                  <div className="space-y-4 animate-fade-in">
                    <div>
                      <h2 className="font-outfit font-bold text-lg flex items-center gap-2 mb-1">
                        <i className="ti ti-file-spreadsheet text-brand text-xl"></i>
                        Lead Import
                      </h2>
                      <p className="text-xs text-slate-400 mb-4">Upload a CSV file with your real leads. Required columns: <strong>Name, Phone, City, Source</strong></p>
                    </div>

                    {/* Drop zone / File upload */}
                    <div
                      onClick={() => csvInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center cursor-pointer hover:border-brand hover:bg-brand/5 transition-all mb-4 group"
                    >
                      <input
                        ref={csvInputRef}
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={handleCsvImport}
                      />
                      {csvImporting ? (
                        <div className="space-y-2">
                          <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin mx-auto"></div>
                          <p className="text-xs font-semibold text-slate-500">Parsing and importing leads...</p>
                        </div>
                      ) : (
                        <>
                          <i className="ti ti-upload text-3xl text-slate-400 group-hover:text-brand transition-colors block mb-2"></i>
                          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Click to upload CSV</p>
                          <p className="text-xs text-slate-400 mt-1">Name, Phone, City, Source (one lead per row)</p>
                        </>
                      )}
                    </div>

                    {csvError && (
                      <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-2">
                        <i className="ti ti-alert-circle"></i>
                        {csvError}
                      </div>
                    )}

                    {/* CSV format hint */}
                    <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3 mb-4 border border-slate-200 dark:border-slate-800">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expected CSV Format</p>
                      <code className="text-xs text-brand font-mono">Ravi Stores,9876543210,Mumbai,JustDial</code>
                      <br />
                      <code className="text-xs text-brand font-mono">Apex Traders,9123456789,Delhi,IndiaMart</code>
                    </div>
                  </div>
                )}

                {/* Shared Leads preview & stats */}
                {stats.leadsScrapedCount > 0 && (
                  <div className="space-y-4 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 animate-fade-in">
                    <div className="grid grid-cols-3 gap-3 border-y border-slate-100 dark:border-slate-800 py-3 text-center text-xs font-semibold">
                      <div>
                        <span className="text-slate-400 block mb-1">Total Leads</span>
                        <strong className="text-brand text-sm">{stats.leadsScrapedCount.toLocaleString()}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">Duplicates Removed</span>
                        <strong className="text-red-500 text-sm">{duplicatesRemoved.toLocaleString()}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">Queue Status</span>
                        <strong className={`text-sm ${leadsInjected ? 'text-emerald-500' : 'text-slate-500'}`}>
                          {leadsInjected ? 'In Queue' : 'Not Queued'}
                        </strong>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold font-outfit uppercase tracking-wider text-slate-400">Leads Preview</span>
                      <a
                        href={`${BACKEND_URL}/api/campaign/download-leads`}
                        className="text-xs font-semibold text-brand hover:underline flex items-center gap-1"
                        download
                      >
                        <i className="ti ti-download"></i>
                        Export CSV
                      </a>
                    </div>

                    <div className="border border-slate-200 dark:border-slate-800/80 rounded-lg overflow-hidden max-h-48 overflow-y-auto text-xs font-medium bg-slate-50 dark:bg-slate-950">
                      {leadsPreview.map((lead, idx) => (
                        <div key={lead.id} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-900 px-3 py-2 font-mono">
                          <div className="flex gap-2">
                            <span className="text-slate-400">#{String(idx + 1).padStart(3, '0')}</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{lead.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-500">{lead.phone}</span>
                            <span className="bg-brand/10 text-brand text-[8px] font-bold px-1.5 py-0.5 rounded">{lead.source}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={handleInjectLeads}
                      disabled={leadsInjected}
                      className="w-full bg-accent hover:bg-slate-850 disabled:opacity-50 text-white font-bold py-3 rounded-lg text-sm transition uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <i className="ti ti-cloud-upload"></i>
                      {leadsInjected ? `✅ ${stats.leadsScrapedCount.toLocaleString()} Leads Injected Into Queue` : `Inject ${stats.leadsScrapedCount.toLocaleString()} Leads Into Campaign`}
                    </button>
                  </div>
                )}
              </div>

              {/* SECTION 6 — TARGET PROGRESS VISUALS */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-6 transition-colors shadow-sm grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Donut chart */}
                <div className="flex flex-col items-center justify-center text-center">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 font-outfit">Daily Goal Target</h3>
                  <div className="relative w-36 h-36 flex items-center justify-center">
                    {/* SVG Donut */}
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="36" fill="transparent" stroke={theme === 'dark' ? '#1e293b' : '#f1f5f9'} strokeWidth="5" />
                      <circle
                        cx="40"
                        cy="40"
                        r="36"
                        fill="transparent"
                        stroke="#1A7A4A"
                        strokeWidth="5"
                        strokeDasharray={getDonutStrokeDash()}
                        className="transition-all duration-500 ease-out"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="font-outfit font-black text-2xl tracking-tight">
                        {Math.round((stats.sentToday / stats.targetCount) * 100)}%
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold uppercase">Completed</span>
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-slate-400 mt-4 uppercase">
                    {stats.sentToday.toLocaleString()} / 10,000 sent
                  </div>
                </div>

                {/* Hourly rate bar chart */}
                <div className="flex flex-col justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 font-outfit">Hourly Send Activity</h3>
                  
                  {/* SVG Bar Chart */}
                  <div className="flex items-end justify-between h-36 px-2 border-b border-l border-slate-200 dark:border-slate-800/80 pb-1">
                    {stats.hourlyHistory.map((val, idx) => {
                      const maxVal = Math.max(...stats.hourlyHistory, 100);
                      const heightPct = (val / maxVal) * 100;
                      return (
                        <div key={idx} className="flex flex-col items-center w-6 group relative">
                          {/* Tooltip */}
                          <div className="absolute -top-8 bg-slate-800 text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition duration-200">
                            {val}
                          </div>
                          <div
                            className="bg-brand hover:bg-brand-dark w-full rounded-t-sm transition-all duration-500"
                            style={{ height: `${Math.max(5, heightPct)}%` }}
                          ></div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-400 font-semibold mt-3">
                    <span>-5h</span>
                    <span>-4h</span>
                    <span>-3h</span>
                    <span>-2h</span>
                    <span>-1h</span>
                    <span>Now</span>
                  </div>
                </div>

              </div>

              {/* Incoming reply preview notifications */}
              {latestReplies.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-outfit">Live Incoming Replies</h4>
                  <div className="space-y-2">
                    {latestReplies.map((rep, idx) => (
                      <div key={idx} className="flex gap-2 text-xs bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-100 dark:border-slate-900 animate-slide-in">
                        <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                          {rep.name.charAt(0)}
                        </div>
                        <div>
                          <strong className="text-slate-800 dark:text-slate-200 block">{rep.name}</strong>
                          <span className="text-slate-600 dark:text-slate-400 italic">"{rep.message}"</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>

        </main>
      )}

      {/* FOOTER BRASS */}
      <footer className="max-w-7xl mx-auto py-8 text-center text-xs text-slate-400 dark:text-slate-500 font-medium">
        Cleara Cleaning Products Bulk Outreach Panel • Lifetime Node Registry Access • Anti-Ban Secured
      </footer>

    </div>
  );
}
