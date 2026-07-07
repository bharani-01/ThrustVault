import React from 'react';
import { X } from 'lucide-react';
import type { CompareType } from '../context/CompareContext';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  type: CompareType | null;
}

interface SpecRow {
  label: string;
  key: string;
  render?: (val: any) => React.ReactNode;
}

const MOTOR_SPECS: SpecRow[] = [
  { label: 'Manufacturer / Brand', key: 'company' },
  { label: 'KV Rating (RPM/V)', key: 'kv_rating', render: (v) => v ? `${v} KV` : '—' },
  { label: 'Operating Voltage Range', key: 'operating_voltage', render: (v) => v || '—' },
  { label: 'Max Thrust Rec.', key: 'max_thrust', render: (v) => v || '—' },
  { label: 'Recommended Propeller', key: 'recommended_propeller', render: (v) => v || '—' },
  { label: 'Recommended ESC', key: 'recommended_esc', render: (v) => v || '—' },
  { label: 'Stator Diameter/Size', key: 'stator_size', render: (v) => v || '—' },
  { label: 'Poles (No. of Magnets)', key: 'poles', render: (v) => v || '—' },
  { label: 'Winding Type/Pattern', key: 'winding_type', render: (v) => v || '—' },
  { label: 'SKU Part Number', key: 'sku', render: (v) => v || '—' },
];

const ESC_SPECS: SpecRow[] = [
  { label: 'Brand', key: 'brand' },
  { label: 'Continuous Current', key: 'continuous_current', render: (v) => v ? `${v} A` : '—' },
  { label: 'Peak Current', key: 'peak_current', render: (v) => v ? `${v} A` : '—' },
  { label: 'Supported LiPo Cells', key: 'input_voltage', render: (v) => v || '—' },
  { label: 'BEC Output Specs', key: 'bec_output', render: (v) => v || '—' },
  { label: 'Weight (g)', key: 'weight', render: (v) => v ? `${v} g` : '—' },
  { label: 'Processor/MCU', key: 'mcu', render: (v) => v || '—' },
  { label: 'Firmware Support', key: 'firmware', render: (v) => v || '—' },
];

const PROP_SPECS: SpecRow[] = [
  { label: 'Brand', key: 'brand' },
  { label: 'Diameter (inches)', key: 'diameter', render: (v) => v ? `${v}"` : '—' },
  { label: 'Pitch (inches)', key: 'pitch', render: (v) => v ? `${v}"` : '—' },
  { label: 'Material', key: 'material', render: (v) => v || '—' },
  { label: 'Blade Count', key: 'blades', render: (v) => v || '—' },
  { label: 'Weight (g)', key: 'weight', render: (v) => v ? `${v} g` : '—' },
  { label: 'Hub Thickness (mm)', key: 'hub_thickness', render: (v) => v ? `${v} mm` : '—' },
  { label: 'Shaft Diameter (mm)', key: 'shaft_diameter', render: (v) => v ? `${v} mm` : '—' },
];

export const CompareModal: React.FC<CompareModalProps> = ({
  isOpen,
  onClose,
  items,
  type
}) => {
  if (!isOpen || items.length === 0) return null;

  // Select appropriate spec rows
  let specsList: SpecRow[] = [];
  if (type === 'motor') specsList = MOTOR_SPECS;
  else if (type === 'esc') specsList = ESC_SPECS;
  else if (type === 'propeller') specsList = PROP_SPECS;

  // Capture unique attributes from all items in case schemas are custom
  const allKeys = new Set(specsList.map(s => s.key));
  items.forEach(item => {
    Object.keys(item).forEach(k => {
      const isExcluded = [
        'id', 'name', 'brand', 'company', 'created_at', 'updated_at', 
        'uploaded_by', 'uploadedBy', 'main_image', 'mainImage', 
        'gallery_images', 'galleryImages', 'link_motor', 'link_esc', 
        'link_propeller', 'linkMotor', 'linkEsc', 'linkProp', 
        'categoryId', 'category_id', 'custom_parameters', 'motor', 'thrust',
        'esc', 'prop', 'mainimage', 'galleryimages'
      ].includes(k.toLowerCase()) || [
        'id', 'name', 'brand', 'company', 'created_at', 'updated_at', 
        'uploaded_by', 'uploadedBy', 'main_image', 'mainImage', 
        'gallery_images', 'galleryImages', 'link_motor', 'link_esc', 
        'link_propeller', 'linkMotor', 'linkEsc', 'linkProp', 
        'categoryId', 'category_id', 'custom_parameters', 'motor', 'thrust',
        'esc', 'prop', 'mainimage', 'galleryimages'
      ].includes(k);
      
      if (!isExcluded) {
        allKeys.add(k);
      }
    });
  });

  // Assemble dynamic rows if they are not in the default spec list
  const dynamicSpecsList = [...specsList];
  allKeys.forEach(k => {
    if (!specsList.some(s => s.key === k)) {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      dynamicSpecsList.push({ label, key: k });
    }
  });

  return (
    <div className="modal-backdrop show" style={{ zIndex: 1100 }}>
      <div className="modal-container bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden mx-4 animate-scale-in">
        
        {/* Modal Header */}
        <div className="modal-header flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3.5 mb-4">
          <h3 className="font-extrabold text-[#001e40] dark:text-slate-100 text-[17px] flex items-center gap-2">
            Specifications Side-by-Side Comparison
          </h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-355 cursor-pointer modal-close-trigger"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body flex-1 overflow-y-auto pr-1">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm text-left border-collapse comparison-result-table">
              <thead>
                <tr>
                  <th className="py-3 px-4 font-bold text-slate-400 bg-slate-50 dark:bg-slate-850 text-xs font-mono uppercase tracking-wider w-1/4 rounded-tl-xl">
                    Specification
                  </th>
                  {items.map((item, index) => (
                    <th 
                      key={item.id}
                      className={`py-3 px-4 font-extrabold text-[#001e40] dark:text-blue-300 bg-slate-50 dark:bg-slate-850 text-center border-l border-slate-200 dark:border-slate-800 w-1/4 ${
                        index === items.length - 1 ? 'rounded-tr-xl' : ''
                      }`}
                    >
                      {item.name || `Item ${index + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {dynamicSpecsList.map((spec) => (
                  <tr key={spec.key} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/20 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 text-xs">
                      {spec.label}
                    </td>
                    {items.map((item) => {
                      const val = item[spec.key];
                      const rendered = spec.render ? spec.render(val) : (val === null || val === undefined ? '—' : String(val));
                      return (
                        <td key={item.id} className="py-3 px-4 text-center border-l border-slate-200 dark:border-slate-800 font-medium">
                          {rendered}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer border-t border-slate-100 dark:border-slate-800 pt-4 mt-4 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-button text-[13px] px-5 py-2.5 rounded-xl font-semibold transition-colors cursor-pointer"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
};
