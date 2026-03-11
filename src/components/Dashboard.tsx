import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Bot, 
  Users, 
  UserPlus, 
  CheckCircle, 
  UserCheck,
  TrendingUp,
  Calendar,
  Clock,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface Stats {
  messages: {
    total: number;
    incoming: number;
    outgoing: number;
    ai_replies: number;
  };
  contacts: {
    total: number;
    new: number;
    converted: number;
    human_takeovers: number;
  };
}

interface Escalation {
  id: number;
  sender_id: string;
  customer_query: string;
  reason: string;
  status: string;
  created_at: string;
  current_status: string;
}

const MOCK_CHART_DATA = [
  { name: 'Mon', messages: 12 },
  { name: 'Tue', messages: 19 },
  { name: 'Wed', messages: 15 },
  { name: 'Thu', messages: 22 },
  { name: 'Fri', messages: 30 },
  { name: 'Sat', messages: 25 },
  { name: 'Sun', messages: 18 },
];

export default function Dashboard() {
  const [range, setRange] = useState('week');
  const [stats, setStats] = useState<Stats | null>(null);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsRes, escRes] = await Promise.all([
        fetch(`/api/admin/stats?range=${range}`),
        fetch('/api/admin/escalations')
      ]);
      const statsData = await statsRes.json();
      const escData = await escRes.json();
      setStats(statsData);
      setEscalations(escData);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [range]);

  const resumeAgent = async (from: string) => {
    try {
      await fetch('/api/agent/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from })
      });
      fetchData();
    } catch (error) {
      console.error('Error resuming agent:', error);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color, subtext }: any) => (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <p className="text-gray-500 text-sm font-medium">{title}</p>
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex flex-col">
        <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
        {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-8 text-gray-900 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {['today', 'week', 'month', 'all'].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  range === r 
                    ? 'bg-emerald-500 text-white shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {r.charAt(0).toUpperCase() + r.slice(1).replace('all', 'All Time')}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Section */}
        <div className="mb-10">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            MESSAGES — {range.toUpperCase()}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Total Messages" 
              value={stats?.messages?.total ?? 0} 
              icon={MessageSquare} 
              color="bg-emerald-50 text-emerald-500" 
            />
            <StatCard 
              title="Incoming" 
              value={stats?.messages?.incoming ?? 0} 
              icon={ArrowDownLeft} 
              color="bg-blue-50 text-blue-500" 
            />
            <StatCard 
              title="Outgoing" 
              value={stats?.messages?.outgoing ?? 0} 
              icon={ArrowUpRight} 
              color="bg-orange-50 text-orange-500" 
            />
            <StatCard 
              title="AI Replies" 
              value={stats?.messages?.ai_replies ?? 0} 
              icon={Bot} 
              color="bg-purple-50 text-purple-500" 
            />
          </div>
        </div>

        {/* Contacts Section */}
        <div className="mb-10">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            CONTACTS & CONVERSIONS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard 
              title="Total Contacts" 
              value={stats?.contacts?.total ?? 0} 
              icon={Users} 
              color="bg-gray-50 text-gray-500" 
            />
            <StatCard 
              title="New Contacts" 
              value={stats?.contacts?.new ?? 0} 
              icon={UserPlus} 
              color="bg-blue-50 text-blue-500" 
              subtext={range === 'week' ? 'This Week' : ''}
            />
            <StatCard 
              title="Converted" 
              value={stats?.contacts?.converted ?? 0} 
              icon={CheckCircle} 
              color="bg-emerald-50 text-emerald-500" 
              subtext={`${Math.round(((stats?.contacts?.converted ?? 0) / (stats?.contacts?.total ?? 1)) * 100)}% conversion rate`}
            />
            <StatCard 
              title="Human Takeovers" 
              value={stats?.contacts?.human_takeovers ?? 0} 
              icon={UserCheck} 
              color="bg-red-50 text-red-500" 
              subtext={stats?.contacts?.human_takeovers ? 'Action required' : 'Manual mode active'}
            />
          </div>
        </div>

        {/* Chart & Escalations List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Chart */}
          <div className="lg:col-span-2 bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" /> Message Volume
              </h3>
              <div className="text-xs font-medium bg-gray-100 px-3 py-1 rounded-full text-gray-500">
                {range.charAt(0).toUpperCase() + range.slice(1)}
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MOCK_CHART_DATA}>
                  <defs>
                    <linearGradient id="colorMsg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 12}}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#94a3b8', fontSize: 12}}
                  />
                  <Tooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="messages" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorMsg)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Escalations List */}
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold">Manager Takeovers</h3>
              <button 
                onClick={fetchData}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 max-h-[400px] pr-2 scrollbar-thin scrollbar-thumb-gray-100">
              {escalations.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="w-6 h-6 text-gray-300" />
                  </div>
                  <p className="text-sm text-gray-400">No active escalations</p>
                </div>
              ) : (
                escalations.map((esc) => (
                  <div key={esc.id} className="p-4 rounded-xl border border-gray-50 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-emerald-700">
                            {esc.sender_id.slice(-2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-bold">{esc.sender_id}</p>
                          <p className="text-[10px] text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {new Date(esc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        esc.current_status === 'true' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {esc.current_status === 'true' ? 'Active' : 'Resolved'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2 mb-3 bg-white p-2 rounded-lg border border-gray-100">
                      "{esc.customer_query}"
                    </p>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 font-medium italic">
                        Reason: {esc.reason}
                      </span>
                      {esc.current_status === 'true' && (
                        <button 
                          onClick={() => resumeAgent(esc.sender_id)}
                          className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                        >
                          Resume Agent <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
