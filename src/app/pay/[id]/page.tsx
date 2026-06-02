'use client';
import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  CreditCard, CheckCircle, AlertTriangle, Loader2, 
  ArrowLeft, FileText, Calendar, DollarSign, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Invoice = {
  _id: string;
  invoiceId: string;
  client: string;
  amount: string;
  date: string;
  due: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  category: string;
  paymentLink?: string;
};

export default function PayInvoicePage() {
  const { id } = useParams() as { id: string };
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // 1. Fetch invoice details
  useEffect(() => {
    if (!id) return;
    
    const fetchInvoice = async () => {
      try {
        const res = await fetch(`/api/invoices/public?id=${id}`);
        const data = await res.json();
        if (data.success && data.invoice) {
          setInvoice(data.invoice);
        } else {
          setError(data.error || 'Invoice not found or deleted.');
        }
      } catch (err) {
        console.error(err);
        setError('Error loading payment details.');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoice();
  }, [id]);

  // 2. Load Razorpay script dynamically
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.error('Razorpay SDK failed to load.');
      setError('Razorpay SDK failed to load. Please check your internet connection.');
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // 3. Initiate payment
  const handlePayment = async () => {
    if (!invoice || !scriptLoaded) return;
    setProcessing(true);
    setPaymentStatus('processing');

    try {
      // Step A: Create order in backend
      const orderRes = await fetch('/api/payment/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id }),
      });
      const orderData = await orderRes.json();

      if (!orderData.success) {
        throw new Error(orderData.error || 'Failed to initialize payment order');
      }

      // Step B: Set up Razorpay Checkout Options
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'Ops Platform',
        description: `Invoice #${orderData.invoiceId} payment`,
        image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&h=100&fit=crop',
        order_id: orderData.orderId,
        handler: async function (response: any) {
          try {
            setPaymentStatus('processing');
            // Step C: Verify payment in backend
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                invoiceId: id,
              }),
            });
            const verifyData = await verifyRes.json();

            if (verifyData.success) {
              setPaymentStatus('success');
              setInvoice(prev => prev ? { ...prev, status: 'Paid' } : null);
            } else {
              throw new Error(verifyData.error || 'Signature verification failed');
            }
          } catch (verifyErr) {
            console.error(verifyErr);
            setPaymentStatus('failed');
          }
        },
        modal: {
          ondismiss: function () {
            setProcessing(false);
            setPaymentStatus('idle');
          }
        },
        prefill: {
          name: orderData.clientName,
        },
        theme: {
          color: '#6366f1',
        },
      };

      const paymentObject = new (window as any).Razorpay(options);
      paymentObject.open();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error launching checkout popup');
      setProcessing(false);
      setPaymentStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Abstract Background Design */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-xl bg-slate-800/40 border border-slate-700/50 backdrop-blur-xl rounded-3xl p-8 shadow-2xl relative z-10">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div 
              key="loading" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-16"
            >
              <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-400 font-medium text-sm">Fetching secure invoice logs...</p>
            </motion.div>
          ) : error ? (
            <motion.div 
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-10"
            >
              <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle size={32} />
              </div>
              <h2 className="text-xl font-bold mb-3 text-white">Payment Error</h2>
              <p className="text-slate-400 mb-8 max-w-md mx-auto text-sm">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 font-bold rounded-xl text-xs transition-all active:scale-95"
              >
                Retry
              </button>
            </motion.div>
          ) : paymentStatus === 'success' ? (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-10"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-6 shadow-[0_0_50px_rgba(16,185,129,0.15)] animate-pulse">
                <CheckCircle size={44} />
              </div>
              <h2 className="text-2xl font-extrabold text-white mb-2">Invoice Fully Paid!</h2>
              <p className="text-slate-400 text-sm mb-2 font-medium">Thank you for your transaction.</p>
              <p className="text-xs text-indigo-400 font-mono mb-8 bg-slate-900/35 border border-slate-700/30 rounded-xl px-4 py-2 max-w-xs mx-auto">
                Invoice ID: {invoice?.invoiceId}
              </p>
              <button 
                onClick={() => window.close()}
                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 font-bold text-xs rounded-xl transition-all shadow-lg active:scale-95"
              >
                Close Portal
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="details"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Top Details */}
              <div className="flex items-center justify-between border-b border-slate-700/40 pb-6 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center text-indigo-400">
                    <FileText size={22} />
                  </div>
                  <div>
                    <h2 className="font-bold text-white text-base">Ops Billing Portal</h2>
                    <p className="text-slate-400 text-xs font-semibold">{invoice?.invoiceId}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-xl text-[10px] uppercase font-bold tracking-wider border ${
                  invoice?.status === 'Paid' 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}>
                  {invoice?.status}
                </span>
              </div>

              {/* Summary Cards */}
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center p-4 bg-slate-900/30 rounded-2xl border border-slate-700/20">
                  <span className="text-slate-400 text-xs font-medium">Billed Client</span>
                  <span className="text-white font-bold text-xs">{invoice?.client}</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-900/30 rounded-2xl border border-slate-700/20 flex flex-col gap-1">
                    <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Issue Date</span>
                    <span className="text-slate-300 font-bold text-xs flex items-center gap-1.5"><Calendar size={12} /> {invoice?.date}</span>
                  </div>
                  <div className="p-4 bg-slate-900/30 rounded-2xl border border-slate-700/20 flex flex-col gap-1">
                    <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold">Due Date</span>
                    <span className="text-slate-300 font-bold text-xs flex items-center gap-1.5"><Calendar size={12} /> {invoice?.due}</span>
                  </div>
                </div>
                <div className="p-5 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 flex justify-between items-center">
                  <div>
                    <span className="text-slate-400 text-xs font-medium block">Total Payable</span>
                    <span className="text-slate-500 text-[10px] font-semibold block mt-0.5">Category: {invoice?.category}</span>
                  </div>
                  <span className="text-2xl font-black text-white tracking-tight flex items-center">{invoice?.amount}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                {invoice?.status === 'Paid' ? (
                  <div className="text-center py-2 text-emerald-400 font-bold text-sm bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                    This invoice has already been fully paid.
                  </div>
                ) : (
                  <button
                    onClick={handlePayment}
                    disabled={processing || !scriptLoaded}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700/50 disabled:text-slate-500 text-white font-bold rounded-2xl transition-all shadow-[0_4px_25px_rgba(99,102,241,0.25)] hover:shadow-[0_4px_35px_rgba(99,102,241,0.4)] active:scale-[0.98] text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Processing Payment...
                      </>
                    ) : (
                      <>
                        <CreditCard size={16} /> Pay Securely via Razorpay
                      </>
                    )}
                  </button>
                )}
                
                <div className="text-center pt-2">
                  <span className="text-[10px] text-slate-500 font-medium inline-flex items-center gap-1">
                    Powered by SSL Encrypted Razorpay Checkout <ExternalLink size={8} />
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
