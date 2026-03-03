import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { motion, AnimatePresence } from 'framer-motion';
import './styles/onboarding.css';
import {
    Puzzle,
    ArrowRight,
    ShieldCheck,
    ChevronLeft,
    Sparkles,
    Layers,
    Cpu,
    Zap,
    GitBranchIcon,
    Heart
} from 'lucide-react';
import { Logo } from './components/ui/Logo.tsx';

const steps = [
    {
        id: 'intro',
        title: 'The Future of Web Interactivity',
        subtitle: 'Welcome to BraceKit',
        description: 'A sovereign, context-aware AI workspace that lives where you work.',
        icon: <Sparkles className="w-12 h-12" />,
        color: 'from-blue-500/20 to-purple-500/20'
    },
    {
        id: 'context',
        title: 'Context is Everything',
        subtitle: 'Deep Page Awareness',
        description: 'BraceKit doesn\'t just chat; it reads. Active pages, selected text, and document structures are all part of its thinking process.',
        icon: <Layers className="w-12 h-12" />,
        color: 'from-emerald-500/20 to-cyan-500/20'
    },
    {
        id: 'mcp',
        title: 'Extend with Real Tools',
        subtitle: 'Model Context Protocol',
        description: 'Connect your favorite tools via MCP. From GitHub to Google Search, give your AI the hands it needs to reach the real world.',
        icon: <Puzzle className="w-12 h-12" />,
        color: 'from-orange-500/20 to-red-500/20'
    },
    {
        id: 'memory',
        title: 'AI that Remembers',
        subtitle: 'Predictive Memory',
        description: 'BraceKit automatically learns your preferences, project details, and habits from conversations to provide truly personalized assistance.',
        icon: <Cpu className="w-12 h-12" />,
        color: 'from-pink-500/20 to-rose-500/20'
    },
    {
        id: 'models',
        title: 'Cognitive Sovereignty',
        subtitle: 'Multi-Model Switcher',
        description: 'Switch instantly between GPT-4o, Claude 3.5, Gemini 1.5 Pro, or DeepSeek. Use the right brain for every specific task.',
        icon: <Zap className="w-12 h-12" />,
        color: 'from-amber-500/20 to-orange-500/20'
    },
    {
        id: 'gallery',
        title: 'Visual Inspiration',
        subtitle: 'Media Gallery',
        description: 'Every image generated or captured across your conversations is archived here. Build your own library of visual assets and ideas.',
        icon: <Sparkles className="w-12 h-12" />,
        color: 'from-violet-500/20 to-fuchsia-500/20'
    },
    {
        id: 'branching',
        title: 'Branching Power',
        subtitle: 'Timeline Control',
        description: 'Explore different paths without losing context. Pick any message in your history and branch it into a new, independent timeline.',
        icon: <GitBranchIcon className="w-12 h-12" />,
        color: 'from-lime-500/20 to-emerald-500/20'
    },
    {
        id: 'privacy',
        title: 'Privacy by Design',
        subtitle: 'Bring Your Own Key',
        description: 'Your data, your keys. We don\'t proxy your requests. BraceKit talks directly to providers from your browser with full encryption.',
        icon: <ShieldCheck className="w-12 h-12" />,
        color: 'from-indigo-500/20 to-blue-500/20'
    }
];

const Background = () => (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#050505]">
        {/* Cinematic Grain */}
        <div
            className="absolute inset-0 opacity-[0.3] mix-blend-overlay pointer-events-none"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
        />

        <motion.div
            animate={{
                scale: [1, 1.1, 1],
                x: [0, 30, 0],
                y: [0, -20, 0]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[-10%] left-[-5%] w-[60vw] h-[60vw] rounded-full bg-[#4f46e5]/10 blur-[120px]"
        />
        <motion.div
            animate={{
                scale: [1, 1.2, 1],
                x: [0, -40, 0],
                y: [0, 40, 0]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-[#9333ea]/10 blur-[120px]"
        />
    </div>
);

const Onboarding = () => {
    const [currentStep, setCurrentStep] = useState(0);
    const isLastStep = currentStep === steps.length - 1;

    const next = () => {
        if (isLastStep) {
            window.close();
        } else {
            setCurrentStep(s => s + 1);
        }
    };

    const prev = () => {
        if (currentStep > 0) setCurrentStep(s => s - 1);
    };

    return (
        <div className="min-h-screen w-full relative flex flex-col items-center justify-center selection:bg-white selection:text-black">
            <Background />

            <main className="relative z-10 w-full max-w-4xl px-6 py-12 flex flex-col items-center">
                <header className="absolute top-12 left-0 right-0 px-12 flex items-center justify-between w-full">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3"
                    >
                        <Logo className="w-8 h-8 text-white" />
                        <span className="text-xl font-bold tracking-tight font-bricolage">BraceKit</span>
                    </motion.div>

                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex gap-1.5">
                            {steps.map((_, idx) => (
                                <div
                                    key={idx}
                                    className={`h-1 rounded-full transition-all duration-500 ${idx === currentStep ? 'w-8 bg-white' : 'w-2 bg-white/20'}`}
                                />
                            ))}
                        </div>
                        <button
                            onClick={() => window.close()}
                            className="text-2xs uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors cursor-pointer"
                        >
                            Skip
                        </button>
                    </div>
                </header>

                <section className="w-full mt-12">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentStep}
                            initial={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                            exit={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="flex flex-col items-center text-center"
                        >
                            <div className={`mb-12 p-8 rounded-3xl bg-linear-to-br ${steps[currentStep].color} border border-white/10 relative group`}>
                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-3xl blur-xl" />
                                <motion.div
                                    initial={{ scale: 0.8, rotate: -10 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    transition={{ delay: 0.2, type: 'spring' }}
                                    className="relative z-10 text-white"
                                >
                                    {steps[currentStep].icon}
                                </motion.div>
                            </div>

                            <motion.span
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="text-white/40 text-sm uppercase tracking-[0.3em] font-medium mb-4"
                            >
                                {steps[currentStep].subtitle}
                            </motion.span>

                            <motion.h1
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="text-5xl md:text-7xl font-serif italic mb-8 tracking-tight leading-tight"
                            >
                                {steps[currentStep].title}
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-lg md:text-xl text-white/50 max-w-xl leading-relaxed font-light mb-12"
                            >
                                {steps[currentStep].description}
                            </motion.p>
                        </motion.div>
                    </AnimatePresence>
                </section>

                <footer className="mt-8 flex items-center gap-4">
                    {currentStep > 0 && (
                        <button
                            onClick={prev}
                            className="p-5 rounded-full border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all active:scale-95 cursor-pointer"
                        >
                            <ChevronLeft className="w-6 h-6" />
                        </button>
                    )}

                    <button
                        onClick={next}
                        className="group flex items-center gap-4 bg-white text-black px-12 py-5 rounded-full font-semibold tracking-wide hover:bg-[#eaeaea] transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer overflow-hidden relative"
                    >
                        <span className="relative z-10">
                            {isLastStep ? 'Get Started' : 'Next Step'}
                        </span>
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1.5 transition-transform relative z-10" />
                        <motion.div
                            className="absolute inset-0 bg-linear-to-r from-blue-400/0 via-blue-400/20 to-blue-400/0 -translate-x-full"
                            animate={{ x: ['100%', '-100%'] }}
                            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        />
                    </button>
                </footer>

                {/* Donation Button */}
                <motion.a
                    href="https://saweria.co/satriaajiputra"
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-12 group relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-linear-to-r from-rose-500/30 via-pink-500/30 to-orange-500/30 rounded-full blur-lg opacity-50 group-hover:opacity-80 transition-opacity" />
                    <div className="relative flex items-center gap-3 px-8 py-4 rounded-full bg-linear-to-r from-rose-500/20 via-pink-500/20 to-orange-500/20 border border-rose-500/30 group-hover:border-rose-400/50 group-hover:from-rose-500/30 group-hover:via-pink-500/30 group-hover:to-orange-500/30 transition-all backdrop-blur-sm overflow-hidden">
                        <Heart size={18} className="text-rose-400 group-hover:text-rose-300 group-hover:scale-110 transition-all" />
                        <span className="text-sm font-semibold tracking-wide text-rose-200 group-hover:text-rose-100">
                            Support Development
                        </span>
                        <motion.div
                            className="absolute inset-0 rounded-full bg-linear-to-r from-rose-400/0 via-rose-400/10 to-rose-400/0 -translate-x-full"
                            animate={{ x: ['100%', '-100%'] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                        />
                    </div>
                </motion.a>

                <div className="mt-8 text-2xs text-white/20 uppercase tracking-[0.4em] font-medium text-center">
                    BraceKit // v{chrome.runtime.getManifest().version} // Part of Nexifle Labs
                </div>
            </main>
        </div>
    );
};

const elm = document.getElementById('root');
if (elm) {
    const root = createRoot(elm);
    root.render(<Onboarding />);
}
