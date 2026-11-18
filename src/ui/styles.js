// Inline styles shared by the plain screens (menu, join) and the race HUD

export const pageStyle = {
  minHeight: '100vh',
  background: '#15251b',
  color: 'white',
  fontFamily:
    'Arial, sans-serif',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

export const panelStyle = {
  background: '#243b2c',
  padding: 32,
  borderRadius: 16,
  width: 420,
  maxWidth: '90vw',
  textAlign: 'center'
};

export const buttonStyle = {
  background: '#70b76d',
  color: '#102016',
  border: 'none',
  padding: '14px 20px',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 'bold',
  cursor: 'pointer',
  margin: 6
};

export const hudStyle = {
  position: 'absolute',
  top: 20,
  right: 20,
  zIndex: 10,
  color: 'white',
  background:
    'rgba(10, 25, 15, 0.82)',
  border:
    '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12,
  padding: '16px 22px',
  minWidth: 170,
  fontFamily:
    'Arial, sans-serif',
  pointerEvents: 'none'
};
