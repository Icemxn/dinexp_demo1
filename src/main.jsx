import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown render error'
    };
  }

  componentDidCatch(error) {
    console.error('App render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: '720px', margin: '40px auto', padding: '0 16px', fontFamily: 'DM Sans, sans-serif' }}>
          <h1 style={{ margin: '0 0 8px' }}>Unable to render the menu</h1>
          <p style={{ margin: '0 0 8px' }}>{this.state.message}</p>
          <p style={{ margin: 0 }}>Check the browser console, then refresh the page.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
