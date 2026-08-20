'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Dashboard from '@uppy/react/dashboard';
import Uppy, { type UppyFile } from '@uppy/core';
import AwsS3Multipart from '@uppy/aws-s3';
import { UppyEncryptPlugin, UppyEncrypt } from 'uppy-encrypt';
import { filesize } from 'filesize';
import { useNewUpload } from './NewUploadContext';
import { publicEnv } from '@/lib/env';

import '@uppy/core/css/style.css';
import '@uppy/dashboard/css/style.css';

async function createUpload(isMultipart = false) {
  const response = await fetch(`/api/upload/s3${isMultipart ? '/multipart' : ''}`, {
    method: 'POST',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

function buildUppy(maxUploadSize: number, maxUploadFiles: number) {
  return new Uppy({
    allowMultipleUploadBatches: false,
    restrictions: {
      maxFileSize: maxUploadSize,
      maxTotalFileSize: maxUploadSize,
      maxNumberOfFiles: maxUploadFiles,
    },
  })
    .use(UppyEncryptPlugin)
    .use(AwsS3Multipart, {
      shouldUseMultipart: (file) => (file.size ?? 0) > 100 * 2 ** 20,
      allowedMetaFields: ['name', 'type'],
      getUploadParameters: async () => {
        const data = await createUpload();
        return {
          method: data.method,
          url: data.url,
          fields: {},
          headers: { 'Content-Type': 'application/octet-stream' },
        };
      },
      createMultipartUpload: async () => {
        return createUpload(true);
      },
      signPart: async (_file, { uploadId, key, partNumber, signal }) => {
        signal?.throwIfAborted();
        if (uploadId == null || key == null || partNumber == null) {
          throw new Error('Cannot sign without a key, an uploadId, and a partNumber');
        }
        const response = await fetch(`/api/upload/s3/multipart/${uploadId}/${partNumber}?key=${encodeURIComponent(key)}`, { signal });
        if (!response.ok) throw new Error('Request failed');
        return response.json();
      },
      listParts: async (_file, { key, uploadId, signal }) => {
        signal?.throwIfAborted();
        if (!uploadId) throw new Error('Missing uploadId');
        const response = await fetch(`/api/upload/s3/multipart/${encodeURIComponent(uploadId)}?key=${encodeURIComponent(key)}`, { signal });
        if (!response.ok) throw new Error('Request failed');
        return response.json();
      },
      completeMultipartUpload: async (_file, { key, uploadId, parts, signal }) => {
        signal?.throwIfAborted();
        if (!uploadId) throw new Error('Missing uploadId');
        const response = await fetch(`/api/upload/s3/multipart/${encodeURIComponent(uploadId)}/complete?key=${encodeURIComponent(key)}`, {
          method: 'POST',
          headers: { accept: 'application/json' },
          body: JSON.stringify(parts),
          signal,
        });
        if (!response.ok) throw new Error('Request failed');
        return response.json();
      },
      abortMultipartUpload: async (_file, { key, uploadId, signal }) => {
        if (!uploadId) return;
        const response = await fetch(`/api/upload/s3/multipart/${encodeURIComponent(uploadId)}?key=${encodeURIComponent(key)}`, {
          method: 'DELETE',
          signal,
        });
        if (!response.ok) throw new Error('Request failed');
      },
    });
}

export function HomeClient() {
  const { setShowButton, setHandler } = useNewUpload();
  const maxUploadFiles = publicEnv.maxUploadFiles;
  const maxUploadSize = publicEnv.maxUploadSize * 1_000_000;
  const expireOptions = publicEnv.expireOptions;
  const maxDownloadOptions = publicEnv.maxDownloadOptions;
  const showFaq = publicEnv.showFaq;

  const [expires, setExpires] = useState<number>(expireOptions[0] ?? 24);
  const [downloads, setDownloads] = useState<number>(maxDownloadOptions[0] ?? 10);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState('');

  const [uppy] = useState(() => buildUppy(maxUploadSize, maxUploadFiles));

  // Sync nav "New Upload" button + reset handler
  useEffect(() => {
    setShowButton(false);
    setHandler(() => setUrl(null));
  }, [setHandler, setShowButton]);

  // Uppy events — expires/downloads captured per-render
  useEffect(() => {
    const onUpload = () => setStatus('Encrypting & uploading…');
    const onComplete = async (result: { successful?: UppyFile<Record<string, unknown>, Record<string, never>>[] }) => {
      setStatus('Finalizing. Please wait…');

      const successful = result.successful ?? [];
      if (!successful.length) {
        setStatus('');
        return;
      }

      const files = successful.map((file) => ({
        path: (file.uploadURL ?? '').split('/').slice(-2).join('/'),
        data: (file.meta as unknown as { encryption: unknown }).encryption,
      }));

      const response = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: JSON.stringify({ expires, downloads, files }),
      });

      const data = (await response.json()) as { upload: string };
      const password = (successful[0].meta as unknown as { password: string }).password;
      const nextUrl = `${window.location.origin}/${data.upload.replace(/-/g, '')}#${password}`;
      setUrl(nextUrl);
      window.scrollTo(0, 0);
      setShowButton(true);

      uppy.cancelAll();
      const plugin = uppy.getPlugin('UppyEncryptPlugin');
      plugin?.setOptions({ password: UppyEncrypt.generatePassword() });
      setStatus('');
    };

    uppy.on('upload', onUpload);
    uppy.on('complete', onComplete);

    return () => {
      uppy.off('upload', onUpload);
      uppy.off('complete', onComplete);
    };
  }, [uppy, expires, downloads, setShowButton]);

  const copyLink = () => {
    const el = document.getElementById('share-input');
    if (el instanceof HTMLInputElement) {
      el.select();
      el.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(el.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <>
      {showFaq && <Script src="https://buttons.github.io/buttons.js" strategy="afterInteractive" />}

      {status && (
        <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-20 flex items-end px-4 py-6 sm:items-start sm:p-6">
          <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
            <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-zinc-900 opacity-80 shadow-lg ring-2 ring-blue-600">
              <div className="p-4">
                <div className="flex items-center">
                  <div className="flex w-0 flex-1 justify-between">
                    <span className="pr-4">
                      <svg className="-ml-1 mr-3 h-5 w-5 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </span>
                    <p className="w-0 flex-1 text-sm font-medium text-white">{status}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`py-12 ${url ? 'hidden' : 'visible'}`}>
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto sm:text-center">
            <h2 className="text-base font-semibold leading-7 text-blue-500">
              Free, ephemeral,{' '}
              <a href="https://github.com/Manyruumpus/Encrypt-exchange" target="_blank" rel="noreferrer" className="underline">
                open-source
              </a>
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              <span className="font-audiowide">0</span>-knowledge encrypted file uploads
            </p>
          </div>
        </div>
        <div className="relative overflow-hidden pt-12">
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <Dashboard
              uppy={uppy}
              width={2432}
              height={384}
              theme="dark"
              disableThumbnailGenerator
              doneButtonHandler={null}
              note={`${filesize(maxUploadSize, { round: 1 })} max upload size. Up to ${maxUploadFiles} files per upload.`}
              proudlyDisplayPoweredByUppy={false}
            />
            <div className="flex flex-col lg:flex-row">
              <div className="lg:w-1/2">
                <div className="pt-2 text-xs text-zinc-300 md:text-base">
                  Expire in:{' '}
                  <select
                    value={expires}
                    onChange={(e) => setExpires(Number(e.target.value))}
                    id="expires"
                    name="expires"
                    className="mx-1 rounded-md border-0 bg-white/5 py-1.5 text-xs text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-blue-500 md:mx-2 md:text-base [&_*]:text-black">
                    {expireOptions.map((value) => (
                      <option key={value} value={value}>
                        {value} Hour{value > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                  or{' '}
                  <select
                    value={downloads}
                    onChange={(e) => setDownloads(Number(e.target.value))}
                    id="downloads"
                    name="downloads"
                    className="mx-1 rounded-md border-0 bg-white/5 py-1.5 text-xs text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-blue-500 md:mx-2 md:text-base [&_*]:text-black">
                    {maxDownloadOptions.map((value) => (
                      <option key={value} value={value}>
                        {value} Download{value > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {url && (
        <div className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
          <h1 className="mt-2 text-center text-3xl font-bold tracking-tight text-white">Your file(s) have been encrypted &amp; uploaded!</h1>
          <p className="mx-auto mt-10 max-w-xl text-center text-lg leading-8 text-zinc-300">Copy &amp; share the link below:</p>
          <form className="mx-auto mt-2 flex max-w-xl gap-x-4" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="share-input" className="sr-only">
              Share
            </label>
            <input
              id="share-input"
              name="share"
              type="text"
              value={url}
              readOnly
              className="min-w-0 flex-auto rounded-md border-0 bg-white/5 px-3.5 py-2 text-white shadow-sm ring-1 ring-inset ring-white/10 focus:ring-2 focus:ring-inset focus:ring-white sm:text-sm sm:leading-6"
            />
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-x-1.5 rounded-md bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              <svg className="-ml-0.5 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512">
                <path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16l140.1 0L400 115.9V320c0 8.8-7.2 16-16 16zM192 384H384c35.3 0 64-28.7 64-64V115.9c0-12.7-5.1-24.9-14.1-33.9L366.1 14.1c-9-9-21.2-14.1-33.9-14.1H192c-35.3 0-64 28.7-64 64V320c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H256c35.3 0 64-28.7 64-64V416H272v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16H96V128H64z" />
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </form>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setUrl(null);
              }}
              className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              <svg className="-ml-0.5 mr-1.5 h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              New Upload
            </a>
          </div>
        </div>
      )}

    </>
  );
}
