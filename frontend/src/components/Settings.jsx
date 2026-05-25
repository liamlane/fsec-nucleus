import { useEffect, useState } from 'react';
import { get } from '../utils/api';

export default function Settings() {
    const [prefs, setPrefs] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        get('/settings/preferences')
            .then(setPrefs)
            .catch(err => setError(err.message));
    }, []);

    return (
        <div className="page">
            <h1>Settings Page</h1>
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            {prefs ? (
                <pre>{JSON.stringify(prefs, null, 2)}</pre>
            ) : (
                <p>Loading preferences...</p>
            )}
        </div>
    );
}