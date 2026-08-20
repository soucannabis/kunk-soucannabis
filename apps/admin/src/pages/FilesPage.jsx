import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminLoader } from '../components/AdminLoader.jsx';

export function FilesPage({ api }) {
  const { id } = useParams();
  const [rows, setRows] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.listFiles('limit=50');
        if (!cancelled) setRows(res.data || []);
        if (id) {
          const one = await api.getFile(id);
          if (!cancelled) setDetail(one.data);
        } else if (!cancelled) {
          setDetail(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, id]);

  if (loading) {
    return <AdminLoader label="Carregando arquivos…" />;
  }

  return (
    <div>
      <h1>Arquivos</h1>
      <p className="muted">Metadados e download via `/files`.</p>
      {error ? <div className="alert alert-error">{error}</div> : null}

      {detail ? (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2>{detail.filename}</h2>
          <p className="mono muted">{detail.id}</p>
          <p>{detail.mime_type}</p>
          <a className="btn btn-primary" href={`/api/v1/files/${detail.id}/download`} target="_blank" rel="noreferrer">
            Download
          </a>
          {' '}
          <Link className="btn" to="/arquivos">Fechar</Link>
        </div>
      ) : null}

      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Filename</th>
              <th>MIME</th>
              <th>Criado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td><Link to={`/arquivos/${row.id}`}>{row.filename}</Link></td>
                <td className="mono">{row.mime_type}</td>
                <td className="muted">{row.created_at || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
