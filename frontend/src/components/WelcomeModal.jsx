import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const QUOTES = [
  { text: "The mind is the limit. As long as the mind can envision the fact that you can do something, you can do it.", author: "Arnold Schwarzenegger" },
  { text: "Everybody wants to be a bodybuilder, but nobody wants to lift no heavy-ass weights.", author: "Ronnie Coleman" },
  { text: "Pain is temporary. Quitting lasts forever.", author: "Lou Ferrigno" },
  { text: "Thoughts become things. If you see it in your mind, you will hold it in your hand.", author: "Kai Greene" },
  { text: "You can have results or excuses. Not both.", author: "Jay Cutler" },
  { text: "Train insane or remain the same.", author: "Branch Warren" },
  { text: "There are no shortcuts. Everything is reps, reps, reps.", author: "Reg Park" },
  { text: "Strength does not come from winning. Your struggles develop your strengths. When you go through hardships and decide not to surrender, that is strength.", author: "Arnold Schwarzenegger" },
  { text: "No one will hand you anything. Everything in this life must be earned.", author: "Flex Wheeler" },
  { text: "The worst thing I can be is the same as everybody else.", author: "Arnold Schwarzenegger" },
  { text: "To be a champion, you have to learn to handle stress and pressure.", author: "Frank Zane" },
  { text: "You have to think it before you can do it. The mind is what makes it all possible.", author: "Kai Greene" },
  { text: "If something stands between you and your success, move it. Never be denied.", author: "Dwayne Johnson" },
  { text: "Success is usually the culmination of controlling failure.", author: "Sylvester Stallone" },
  { text: "Don't have $100 shoes and a 10 cent squat.", author: "Louie Simmons" },
];

const TODAY_KEY = 'ironlog_welcome_date';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function WelcomeModal() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  useEffect(() => {
    if (!user) return;
    const last = localStorage.getItem(TODAY_KEY);
    if (last !== todayStr()) setShow(true);
  }, [user]);

  const dismiss = () => {
    localStorage.setItem(TODAY_KEY, todayStr());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={dismiss} style={{ zIndex: 200, alignItems: 'center', justifyContent: 'center' }}>
      <div className="welcome-modal" onClick={e => e.stopPropagation()}>
        <div className="welcome-modal-glow" />

        <div className="welcome-modal-header">
          <Flame size={28} color="var(--accent)" />
          <div>
            <div className="welcome-modal-greeting">{greeting()}, {user?.username}</div>
            <div className="welcome-modal-date">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
        </div>

        <div className="welcome-modal-quote">
          <div className="welcome-modal-quote-mark">"</div>
          <p className="welcome-modal-quote-text">{quote.text}</p>
          <div className="welcome-modal-quote-author">— {quote.author}</div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 8, fontSize: 16, padding: '14px 0' }} onClick={dismiss}>
          Let's Go 💪
        </button>
      </div>
    </div>
  );
}
