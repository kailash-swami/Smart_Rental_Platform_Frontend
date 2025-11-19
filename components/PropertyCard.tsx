
import React, { useState } from 'react'
import Image from 'next/image'
import { Property } from '@/types'
import { FiMapPin, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi'
import EnquireModal from './EnquireModal'
import { useAuth } from '@/lib/AuthContext'

interface PropertyCardProps {
  property: Property
}

const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  const { user } = useAuth()
  const mainImage = property.images?.[0]?.url || '/placeholder-property.jpg'
  const fraudLevel = property.fraudScore ?? 0
  const [openEnquire, setOpenEnquire] = useState(false)

  const FraudBadge: React.FC = () => {
    if (fraudLevel < 0.3) return <span className="flex items-center space-x-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded"><FiCheckCircle className="w-3 h-3" /><span>Verified</span></span>
    if (fraudLevel < 0.6) return <span className="flex items-center space-x-1 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded"><FiAlertTriangle className="w-3 h-3" /><span>Caution</span></span>
    return <span className="flex items-center space-x-1 px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded"><FiAlertTriangle className="w-3 h-3" /><span>High Risk</span></span>
  }

  const formatINR = (amount: number | string | null | undefined) => {
    const n = Number(amount ?? 0)
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
  }

  const formatPredicted = (value?: number | null) => {
    if (value === undefined || value === null) return null
    const rounded = Math.round(Number(value) / 100) * 100
    return formatINR(rounded)
  }

  return (
    <>
    <a href={`/properties/${property.id}`} className="block">
      <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow duration-300 cursor-pointer h-full flex flex-col">
        <div className="relative h-48 bg-gray-200">
          <Image src={mainImage} alt={property.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />
          <div className="absolute top-2 right-2"><FraudBadge /></div>
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-2 line-clamp-2">{property.title}</h3>
          <div className="flex items-center text-gray-600 text-sm mb-2">
            <FiMapPin className="w-4 h-4 mr-1" />
            <span className="line-clamp-1">{property.city ?? ''}</span>
          </div>
          <p className="text-gray-600 text-sm mb-4 line-clamp-2 flex-1">{property.description}</p>

          <div className="mt-auto">
            <div className="flex items-baseline justify-between border-t pt-3">
              <div>
                <div className="flex items-center text-primary-600 font-bold text-xl">
                  <span>{formatINR(property.price)}</span>
                </div>
                <span className="text-xs text-gray-500">per month</span>
              </div>

              <div className="text-right">
                {property.predictedIsFallback !== true && property.predictedRent !== undefined && property.predictedRent !== null ? (
                  <>
                    <div className="text-sm text-gray-600">AI Predicted:</div>
                    <div className="text-sm font-semibold text-green-600">{formatPredicted(property.predictedRent)}</div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400">No prediction yet</div>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={(e)=>{ e.preventDefault(); e.stopPropagation(); setOpenEnquire(true)}} className="px-3 py-2 bg-primary-600 text-white rounded">Rent Enquire</button>
            </div>
          </div>
        </div>
      </div>
    </a>

    {openEnquire && (
      <EnquireModal propertyId={property.id} propertyTitle={property.title} onClose={() => setOpenEnquire(false)} />
    )}
    </>

  )
}

export { PropertyCard }
export default PropertyCard

