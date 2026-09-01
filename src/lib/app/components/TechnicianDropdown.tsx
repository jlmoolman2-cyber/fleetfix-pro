'use client';

import { useEffect, useState } from 'react';
import { clientDb } from '@/lib/firebaseClient';
import {
  collection,
  getDocs,
  query,
  where
} from 'firebase/firestore';

export default function TechnicianDropdown({ onSelect }: any) {
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    async function fetchTechnicians() {
      try {
        const q = query(
          collection(clientDb, 'users'),
          where('role', '==', 'TECHNICIAN'),
          where('status', '==', 'ACTIVE')
        );

        const snapshot = await getDocs(q);

        const techList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setTechnicians(techList);

      } catch (error) {
        console.error('Error loading technicians:', error);
      }
    }

    fetchTechnicians();
  }, []);

  const handleChange = (e: any) => {
    const selectedId = e.target.value;
    setSelected(selectedId);

    const tech = technicians.find(t => t.id === selectedId);

    if (tech) {
      onSelect({
        id: tech.id,
        name: tech.name
      });
    }
  };

  return (
    <div>
      <label>Assign Technician</label>
      <select value={selected} onChange={handleChange}>
        <option value="">Select technician</option>

        {technicians.map((tech) => (
          <option key={tech.id} value={tech.id}>
            {tech.name}
          </option>
        ))}
      </select>
    </div>
  );
}
