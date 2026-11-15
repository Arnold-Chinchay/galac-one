import React from 'react';
import type { ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Browser page translation (Brave, Chrome, Edge) swaps the text nodes React rendered for its own. When React later
// removes or moves one of those, the DOM throws "not a child of this node" and the whole app unmounts to an empty
// page. Tolerating that one mismatch keeps the page alive while translated.
if (typeof Node === 'function' && Node.prototype) {
  const remove = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return remove.call(this, child) as T;
  };
  const insert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return insert.call(this, node, null) as T;
    return insert.call(this, node, ref) as T;
  };
}

/** Any other crash shows a way back instead of a blank page. */
class Recover extends React.Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="crash"><h1>Something went wrong on this page.</h1>
      <p>Your answers and points are saved on this device. If your browser is translating the page, turning translation off for this site can help.</p>
      <button className="button primary" onClick={() => location.reload()}>Reload</button></div>;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Recover><App /></Recover></React.StrictMode>);
