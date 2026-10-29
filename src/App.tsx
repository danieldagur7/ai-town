import Game from './components/Game.tsx';

import { ToastContainer } from 'react-toastify';
import helpImg from '../assets/help.svg';
// import { UserButton } from '@clerk/clerk-react';
// import { Authenticated, Unauthenticated } from 'convex/react';
// import LoginButton from './components/buttons/LoginButton.tsx';
import { useState } from 'react';
import ReactModal from 'react-modal';
import MusicButton from './components/buttons/MusicButton.tsx';
import Button from './components/buttons/Button.tsx';
import HeroMenu from './components/HeroMenu.tsx';
import FreezeButton from './components/FreezeButton.tsx';
import AutorunButton from './components/AutorunButton.tsx';
import ClockBadge from './components/ClockBadge.tsx';
import ResourceBar from './components/ResourceBar.tsx';
import TownNews from './components/TownNews.tsx';
import GodMenu from './components/GodMenu.tsx';
import PeopleMenu from './components/PeopleMenu.tsx';
import { GodUiProvider } from './godUi.tsx';

export default function Home() {
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  return (
    <GodUiProvider>
      <main className="relative h-screen w-screen overflow-clip bg-brown-900 font-body">
        <ReactModal
          isOpen={helpModalOpen}
          onRequestClose={() => setHelpModalOpen(false)}
          style={modalStyles}
          contentLabel="Help modal"
          ariaHideApp={false}
        >
          <div className="font-body">
            <h1 className="text-center text-6xl font-bold font-display game-title">Help</h1>
            <p>
              Welcome to AI town: a little society that grows, loves, fights, builds and dies on its
              own, with you as its god, as one of its people, or both.
            </p>
            <h2 className="text-4xl mt-4">Watching</h2>
            <p>
              Drag to move around and scroll to zoom. Click anyone to see what they're saying, how
              old they are, how they're doing and how they feel about everyone. People finds anyone
              on the map; the era button shows the town news.
            </p>
            <h2 className="text-4xl mt-4">Playing as yourself</h2>
            <p>
              "Play as me" lets you create your own character. Click the map to walk, click someone
              and "Start conversation" to talk, and join meetings from their card. Work, pray, make
              friends and enemies, fall in love and start a family. When your character dies they're
              gone for good: start someone new, or carry on as one of your children.
            </p>
            <h2 className="text-4xl mt-4">God mode</h2>
            <p>
              Answer prayers (or let auto-answer decide by your decrees), issue decrees, punish,
              manifest as The Light, command buildings, and type anything into "Command the world"
              to change the world directly.
            </p>
          </div>
        </ReactModal>
        {/*<div className="p-3 absolute top-0 right-0 z-10 text-2xl">
        <Authenticated>
          <UserButton afterSignOutUrl="/ai-town" />
        </Authenticated>

        <Unauthenticated>
          <LoginButton />
        </Unauthenticated>
      </div> */}

        <div className="absolute inset-0">
          <Game />
        </div>

        <header className="absolute top-0 left-0 z-10 flex flex-wrap items-center gap-3 p-3 pointer-events-none">
          <FreezeButton />
          <MusicButton />
          <AutorunButton />
          <HeroMenu />
          <Button imgUrl={helpImg} onClick={() => setHelpModalOpen(true)}>
            Help
          </Button>
          <PeopleMenu />
          <GodMenu />
          <ClockBadge />
          <ResourceBar />
          <TownNews />
        </header>
        <ToastContainer position="bottom-right" autoClose={2000} closeOnClick theme="dark" />
      </main>
    </GodUiProvider>
  );
}

const modalStyles = {
  overlay: {
    backgroundColor: 'rgb(0, 0, 0, 75%)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '50%',

    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};
